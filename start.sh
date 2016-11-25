#!/bin/bash
DIR="$(pwd)"

BC="$DIR/blockchain"
# Make sure that the directory under /chaincode is the same as the project name
CC="$DIR/chaincode"
CC_GLOBAL="$GOPATH/src/github.com/chaincode"

printf "\nCurrent directory: $DIR \n"
printf "Local chaincode directory: $CC \n"
printf "Global chaincode directory: $CC_GLOBAL \n"
printf "Blockchain directory: $BC \n"

clear_all()
{
    rm $BC/data/latest_deployed 2>/dev/null
    printf "Latest deployed removed\n"
    rm -rf /var/hyperledger/production && rm -rf /tmp/keyValStore 2>/dev/null
    printf "keyValStore and var files removed\n"
    docker rm -f $(docker ps -a -q) 2>/dev/null
    printf "All docker containers removed\n"
    docker rmi $(docker images | grep "dev-" | awk '{print $1}') 2>/dev/null
    docker rmi $(docker images -qf "dangling=true") 2>/dev/null
    printf "All docker useless images removed\n"
}

clear_all

# copy chaincode in main folder
mkdir -p $CC_GLOBAL
yes | cp -rf $CC/chaincode.go $CC_GLOBAL/chaincode.go
printf "Latest chaincode copied from local to global folder\n"
cd $CC_GLOBAL
printf "$(pwd)"
govend -v
cd $DIR

# run docker-compose
docker-compose up -d 2>/dev/null
printf "Starting docker containers...\n"
sleep 10
printf "Docker containers up and running\n"

# start server, catch ctrl+c to clean up
trap 'kill -TERM "$PID" 2>/dev/null' SIGINT
npm start &
PID=$!
wait $PID

clear_all

exit 0
