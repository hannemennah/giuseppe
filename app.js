var express = require("express"),
    app = express(),
    http = require('http'),
    server = http.createServer(app),
    io = require('socket.io').listen(server),
    bodyParser = require('body-parser'),
    errorHandler = require('errorhandler'),
    hostname = process.env.HOSTNAME || 'localhost',
    port = parseInt(process.env.PORT, 10) || 1234,
    bitcoin = require('bitcoinjs-lib')
    API = require('cb-blockr'),
    child_process = require('child_process'),
    publicDir = __dirname + '/public',
    bitcoinCommandPath = '/home/example/bitcoin-0.10.2/bin/bitcoin-cli ',
    whichNetworkToUse = 'testnet';

app.get("/", function (req, res) {
  res.redirect("/giuseppe.html");
});

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
  extended: true
}));
app.use(express.static(publicDir));
app.use(errorHandler({
  dumpExceptions: true,
  showStack: true
}));

console.log("Transaction crafter accessible at http://%s:%s", hostname, port);
server.listen(port, hostname);

var eckey,
    changePriv,
    changePub;
var addedUser = false;

io.on('connection', function (socket) {

    //When user enters a new change address, this fires; verifies address is legitimate
    //  and whether or not it is owned by the wallet on this computer
    socket.on('newChangeAddress', function(changeAddress) {
        if(isAddress(changeAddress)){
          isMyAddress(changeAddress, whichNetworkToUse, function(isMine) {
             socket.emit('freshChange', changeAddress.toString(), isMine);
          });
          changePub = changeAddress;
        } else {
            //alert user with text box
            socket.emit('magicText', (changeAddress.toString() + " is not a valid address."));
            isMyAddress(changePub, whichNetworkToUse, function(isMine) {
                socket.emit('freshChange', changePub.toString(), isMine);
            });
        }
    });

    //When user clicks Δ button, this fires; import app-generated private key into wallet
    //  and update changeAddress box to match it. 
    socket.on('usePageChange', function() {
        if(whichNetworkToUse === 'testnet') changePub = eckey.pub.getAddress(bitcoin.networks.testnet);
        else changePub = eckey.pub.getAddress(bitcoin.networks.bitcoin);

        addPagePrivateKey(function(returnValue) {        
            socket.emit('freshChange', changePub.toString(), returnValue);
        });
    });

    //When page first loads, generate a new private+public keypair
    // (used if user does not want to supply their own change address)
    socket.on('pageLoad', function() {
            eckey = bitcoin.ECKey.makeRandom();
            if(whichNetworkToUse === 'testnet') changePriv = eckey.toWIF(bitcoin.networks.testnet);
            else changePriv = eckey.toWIF(bitcoin.networks.bitcoin);

            if(whichNetworkToUse === 'testnet') changePub = eckey.pub.getAddress(bitcoin.networks.testnet);
            else changePub = eckey.pub.getAddress(bitcoin.networks.bitcoin);
            socket.emit('freshChange', changePub.toString(), false);
    });

    //This verifies that a new address is valid, and checks for ownership before updating the page
    socket.on('addNewAddress', function(inputAddress, typeOfAddress, parent, receiveAmount) {
        receiveAmount = receiveAmount || 0.00;
        receiveAmount = parseFloat(receiveAmount);
        if(isAddress(inputAddress)){
            getUnspents(inputAddress, whichNetworkToUse, function(err, inputAddress, unspents){

                isMyAddress(inputAddress, whichNetworkToUse, function(doIOwn) {

                    if(typeOfAddress === 'change') {
                        socket.emit('freshChange', inputAddress.toString(), doIOwn);
                    } else if(typeOfAddress === 'origin') {
                        socket.emit('validNewOriginAddress', inputAddress, unspents, doIOwn);
                    } else {
                        socket.emit('validNewRecipientAddress', inputAddress, unspents, doIOwn, parent, receiveAmount);
                    }
                });
            });
        } else {
            //alert user of address invalidity
            socket.emit('magicText', (inputAddress.toString() + " is not a valid address."));
        }
    });

    socket.on('tryToMatchPrivate', function(address, allegedPrivateKey){
        console.log("STILL TODO - VALIDATE");
    });


    //When user clicks 'gear' icon, this fires to toggle the magicBox transaction view;
    //  if the transaction is in human-readable form, it updates to raw-transaction format
    //  if the transaction is in raw format, it decodes the transaction
    socket.on('toggle', function(readable, text) {   
        formatForBash(text, function(bashText) {
            if(readable) {
                child_process.exec((bitcoinCommandPath + 'createrawtransaction ' +
                                    bashText), function(error, stdout, stderr){
                    myOutput = stdout;
                    socket.emit('magicText', myOutput);
                });
            } else {
                child_process.exec((bitcoinCommandPath + 'decoderawtransaction ' + 
                                    bashText), function(error, stdout, stderr){
                myOutput = stdout;
                socket.emit('magicText', myOutput);
                });
            }
        });
    });

    //Sign the raw transaction in the textBox, and replace text with the new signed tx
    socket.on('signTx', function(readable, text) {   
        formatForBash(text, function(bashText) {
            if(readable) {
                child_process.exec((bitcoinCommandPath + 'createrawtransaction ' + 
                                    bashText), function(error, stdout, stderr){
                    myOutput = stdout;
                    formatForBash(myOutput, function(definitelyBashText) {
                        child_process.exec((bitcoinCommandPath + 'signrawtransaction ' + 
                                            definitelyBashText), function(error2, stdout2, stderr2){
                                        socket.emit('magicText', stdout2);
                        });
                    });
                });
            } else {
                child_process.exec((bitcoinCommandPath + 'signrawtransaction ' + 
                                    bashText), function(error, stdout, stderr){
                myOutput = stdout;
                socket.emit('magicText', myOutput);
                });
            }
        });
    });

    //Send the completed+signed raw transaction to the network
    socket.on('sendTx', function(text) {   
        child_process.exec((bitcoinCommandPath + 'sendrawtransaction ' + 
                                    text), function(error, stdout, stderr){
                myOutput = stdout;
                socket.emit('magicText', "TRANSACTION SENT TO NETWORK");
                });
    });

    //Build a JSON-formatted transaction using the information on page
    socket.on('magicUpdate', function(myNodes, fee) {   
        var originIndex = idxOfAttr(myNodes, 'type', 'origin');
        if(originIndex != -1){
            var justRecipients = [];
            var thisTotal = 0;
            var newRecipient;
            var totalSpent = 0;
            var totalToChange = 0;
            var magicString = '';
            //go through every recipient and merge inputs into one total
            for(idx = 0; idx < myNodes.length; idx++) {
                if(myNodes[idx].type === "recipient") {
                    thisTotal = 0;
                    myNodes[idx].inbounds.forEach(function(inbound) {
                        thisTotal += parseFloat(inbound.amount);
                        totalSpent += parseFloat(inbound.amount);
                    });
                    newRecipient = { address: myNodes[idx].address, amount: thisTotal };
                    justRecipients.push(newRecipient);
                } 
            }
            var originAddress = myNodes[originIndex].address;
            var changeAddress = myNodes[idxOfAttr(myNodes, 'type', 'change')].address;
            totalUnspents(originAddress, whichNetworkToUse, function(err, addyToGet, totalToSpend) {
                totalToChange = parseFloat((parseFloat(totalToSpend) - parseFloat(fee) - parseFloat(totalSpent)).toFixed(8));
                //build string!
                magicString += '[';
                getUnspents(originAddress, whichNetworkToUse, function(err, addy, unspents) {
                    unspents.forEach(function(unspent) {
                        magicString += '{';
                        magicString += '"txid": "\'';
                        magicString += unspent.txId;
                        magicString += '\'", "vout": \'';
                        magicString += unspent.vout;
                        magicString += "' },"
                    });
                    //remove last comma
                    magicString = magicString.slice(0, -1);
                    magicString += ']';
                    magicString += "{";
                    justRecipients.forEach(function(receiver) {
                        magicString += '"\'';
                        magicString += receiver.address;
                        magicString += '\'": ';
                        magicString += receiver.amount;
                        magicString += ',';
                    });
                    if(totalToChange > 0){
                        magicString += '"\'';
                        magicString += changeAddress;
                        magicString += '\'": ';
                        magicString += totalToChange.toString();
                    } else {
                        //remove last comma
                        magicString = magicString.slice(0, -1);
                    }
                    magicString += "}"; 
                    //finally, update textbox to display JSON-formatted transaction
                    socket.emit('magicText', magicString);
                });

            });
         }

    });

});

//Import app-generated private key into local wallet
function addPagePrivateKey(callback) {
    child_process.exec((bitcoinCommandPath + 'importprivkey ' + changePriv), function(error, stdout, stderr){
            if(error) callback(false);
            else callback(true);
    });
}

//Check to see if local wallet owns address
function isMyAddress(address, network, callback) {
    var isMine = false;
    child_process.exec((bitcoinCommandPath + ' validateaddress ' + address), function(error, stdout, stderr){
        myOutput = JSON.parse(stdout);
        isMine = Boolean(myOutput["ismine"]);
        callback(isMine);
    });
}

//Gather all current unspents for address
function getUnspents(address, network, callback) {
  var api = new API(network)
  api.addresses.unspents(address, function(err, results) {
    if(err) return callback(err)

    var unspents = results.map(function(r) {
      return {
        txId: r.txId,
        vout: r.vout,
        value: r.value
      }
    })
    callback(null, address, unspents)
  })
}

//Gather and total all current unspents for address
function totalUnspents(addressToGet, network, callback) {
      getUnspents(addressToGet.toString(), network, function(err, address, unspents) {
        totalReturn = 0.0;
        unspents.forEach(function(unspent) {
          totalReturn += parseFloat(unspent.value);
        });
        callback(null, addressToGet, totalReturn);
      });
}

//Format JSON-formatted transactions to be bash-friendly, so they work on the command line
function formatForBash(inputString, callback) {
    if(inputString.substring(0,1) === "["){
        inputString = "'''" + inputString;
        var firstCloseBracket = inputString.indexOf("]");
        inputString = inputString.substring(0,(firstCloseBracket+1)) + "''' '''" + inputString.substring(firstCloseBracket+1) + "'''";
    }
    callback(inputString);
}

//Verify whether input string is a valid Bitcoin address
function isAddress(string) {
  try {
    bitcoin.Address.fromBase58Check(string)
  } catch (e) {
    return false
  }

  return true
}

//Return the index of the first element in 'array' which has an 'attr'ibute equal to 'value'
function idxOfAttr(array, attr, value) {
    for(var i = 0; i < array.length; i += 1) {
        if(array[i][attr] === value) {
            return i;
        }
    }
    return -1;
}

