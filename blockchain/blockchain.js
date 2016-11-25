'use strict';

var hfc = require('hfc');
var fs = require('fs-extra');
var crypto = require('crypto')
var logger = require('./logger');
var config = require('./chaincodeconfig');


var chain, chaincodeID;

// Initialize blockchain.
exports.init = function(){
    logger.info("[SDK] Initializing the blockchain")

    chain = hfc.newChain("chain-network");

    var ca = config.network.ca[Object.keys(config.network.ca)[0]]
    var peer = config.network.peers[0]


        logger.info("[SDK] Running in local mode")

        chain.setKeyValStore(hfc.newFileKeyValStore('/tmp/keyValStore'));

        chain.setMemberServicesUrl("grpc://"+ca.url);
        chain.addPeer("grpc://"+peer.discovery_host+":"+peer.discovery_port);


    logger.info("[SDK] Connected to memberservice and peer")

    registerAdmin()
}

// Register Admin user
var registerAdmin = function(){

    // Getting admin user
    var adminUser;
    for (var i= 0;i<config.network.users.length;i++){
        if (config.network.users[i].username == "WebAppAdmin"){
            adminUser = config.network.users[i]
            break
        }
    }

    // Enroll "WebAppAdmin" which is already registered because it is
    // listed in fabric/membersrvc/membersrvc.yaml with it's one time password.
    chain.enroll(adminUser.enrollId, adminUser.enrollSecret, function(err, webAppAdmin) {
       if (err) {
           logger.error("[SDK] Failed to register WebAppAdmin, ",err)
           console.log(err)
           console.log(webAppAdmin)
       } else {
           logger.info("[SDK] Successfully registered WebAppAdmin")

           // Set WebAppAdmin as the chain's registrar which is authorized to register other users.
           chain.setRegistrar(webAppAdmin);

           // Register and enroll the users
           registerUsers()

           // Deploy the chaincode
           deployChaincode()
       }

    });

}

// Register the users
var registerUsers = function(){

    logger.info("[SDK] Going to register users")

    // Register and enroll all the user that are in the chaincodeconfig.js
    config.network.app_users.forEach(function(user) {

        chain.getUser(user.username, function (err, userObject) {
            if (err) {
                logger.error("[SDK] Error getting user ",user.username)
                logger.info(err)
            } else if (userObject.isEnrolled()) {
                logger.info("[SDK] User "+ user.username +" is already enrolled")
            } else {

                // In our current way of working the below will only be done locally, on bluemix this code is not executed

                // User is not enrolled yet, so perform both registration and enrollment
                var registrationRequest = {
                    enrollmentID: user.username,
                    affiliation: "institution_a",
                    account: "group1"
                }
                chain.registerAndEnroll(registrationRequest, function (err) {
                    if (err) {
                        logger.error("[SDK] Error registering and enrolling user",user.username)
                        logger.info(err)
                    } else {
                        logger.info("[SDK] User "+ user.username +" successfully registered and enrolled")
                    }
                });
            }
        });

    })
}

// Store chaincode id for later use (so we don't have to redeploy).
var saveLatestDeployed = function() {
	fs.writeFile('blockchain/data/latest_deployed', chaincodeID);
};

// Get chaincode id from file
var loadLatestDeployed = function(cb){
	fs.readFile('blockchain/data/latest_deployed', function read(err, data) {
	    var latestDeployed = data ? data.toString() : null;
	    return cb(err, latestDeployed);
	});
};

// Generate a unique string
var createHash = function(){
    var md5 = crypto.createHash('md5');
    md5.update(new Date().getTime().toString());
    return md5.digest('base64').toString();
};

// Function to deploy the chaincode
var deployChaincode = function(forceRedeploy){



        // We are running locally
        logger.info("[SDK] Checking if redeploy is needed")

        // Load the previously deployed chaincode
        loadLatestDeployed(function(err, latestDeployed){

            // Don't overwrite the deployed_name if it's already set
            if (!config.deployed_name && !err) {
                config.chaincode.deployed_name = latestDeployed;
            }

            var notDeployedYet = config.chaincode.deployed_name === ('' || null);

            if (notDeployedYet || forceRedeploy){

                logger.info("[SDK] Going to deploy chaincode")

                // Including a unique string as an argument to make sure each new deploy has a unique id
                logger.info("[SDK] Global path to chaincode: " + config.chaincode.global_path);
                var deployRequest = {
                    fcn: "init",
                    args: ['a','1000','b','10000'],
                    chaincodePath: config.chaincode.global_path // Path to the global directory containing the chaincode project under $GOPATH/src/
                };

                var webAppAdmin = chain.getRegistrar();

                // Deploy the chaincode
                var deployTx = webAppAdmin.deploy(deployRequest);
                deployTx.on('complete', function(results) {
                    logger.info("[SDK] Successfully deployed chaincode");
                    logger.info("[SDK] Deploy result: ",results)

                    afterDeployment(results.chaincodeID);

                });
                deployTx.on('error', function(err) {
                    logger.error("[SDK] Failed to deploy chaincode");
                    logger.error("[SDK] Deploy error: ",err)
                });
            } else {
                logger.info("[SDK] Using previously deployed chaincode: " + config.chaincode.deployed_name)

                afterDeployment(config.chaincode.deployed_name);
            }
        });
    }


// Save details for deployed code
var afterDeployment = function(newChaincodeID) {

    // Store the chaincodeId
    chaincodeID = newChaincodeID;

    logger.info("[SDK] Executing after deployment")

	// store deployed_name in a file
	saveLatestDeployed();


}


// Function to get the user and the user certificata
var getUser = function(userName, cb) {

    chain.getUser(userName, function (err, user) {
        if (err) {
            return cb(err);
        } else if (user.isEnrolled()) {
            user.getUserCert(null, function (err, userCert) {
                if (err) {
                    logger.error("Failed to get user certificate")
                    return cb(err)
                } else {
                    return cb(null, user)
                }
            })
        } else {
            return cb("user is not yet registered and enrolled")
        }
    });
}

// Execute a invoke request
exports.invoke = function (fcn, userName, args, cb) {
    // Temporary? fix for new hyperledger version [august 2016]
    //args.push(userName);

    getUser(userName, function (err, user) {
        if (err) {
            logger.error("[SDK] Failed to get " + userName + " ---> ", err);
            cb(err)
        } else {

            // Issue an invoke request
            var invokeRequest = {
                chaincodeID: chaincodeID,
                fcn: fcn,
                args: args,
                attrs: ['userName']
            }

            // Invoke the request from the user object.
            var tx = user.invoke(invokeRequest);

            tx.on('submitted', function(results) {
                logger.info("[SDK] submitted invoke:",results);
            });
            tx.on('complete', function(results) {
                logger.info("[SDK] completed invoke:",results);
                cb(null, results)
            });
            tx.on('error', function(err) {
                logger.error("[SDK] error on invoke:",err);
                cb(err)
            });
        }
    })
}

// Execute a query request
exports.query = function(fcn, userName, args, cb) {
    // Temporary? fix for new hyperledger version [august 2016]
  //  args.push(userName);

    getUser(userName, function (err, user) {
        if (err) {
            logger.error("[SDK] Failed to get " + userName + " ---> ", err);
            cb(err)
        } else {

            // Issue an invoke request
            var queryRequest = {
                chaincodeID: chaincodeID,
                fcn: fcn,
                args: args,
                attrs: ['userName']
            }

            // Trigger the query from the user object.
            var tx = user.query(queryRequest);

            tx.on('submitted', function(results) {
                logger.info("[SDK] submitted query: %j",results);
            });
            tx.on('complete', function(results) {
                logger.info("[SDK] completed query: %j",results.result.toString());
                cb(null, JSON.parse(results.result.toString()))
            });
            tx.on('error', function(err) {
                logger.error("[SDK] error on query: %j",err);
                cb(err)
            });
        }

    })
}
