var express = require('express');
var blockchain = require('./blockchain/blockchain');
var app = express();


// initialize blockchain
blockchain.init();

app.get('/', function (req, res) {
  res.send('Hello Hackathon!');
});

app.get('/query', function (req, res) {
 blockchain.query('query','emma1',['a'],function(e,o){
        if (!o) {
          console.log('user not found');
        } else {
            console.log('success= '+ o);
            var result = 'balance= '+o;
              res.send(result);
        }
  });

});
app.get('/invoke', function (req, res) {
  var result = blockchain.invoke('invoke','emma1',['a','b','100'],function(e,o){
        if (!o) {
          console.log('user not found');
        } else {
            console.log('success= ' + o);
            res.send(o);
        }

  });

});

app.listen(3000, function () {
  console.log('Boilerplate app listening on port 3000');
});
