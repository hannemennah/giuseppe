# giuseppe
graphical interface for utxo signature events: production, portrayal, and emission




Manual Transaction Creation Assistant
--------------

A tool to assist in constructing and visualizing manual transactions. As parameters of the transaction are specified, the corresponding transaction hash is generated and updated dynamically. The transaction is depicted in a chart, built in d3.js and updated in real-time. 

**The app requires a local instance of bitcoind to be running**, and provides the option to sign and send the constructed transactions once they are complete. 

Installing
--------------
From the root directory, run:

    sudo npm install 

Once the required Node.JS modules have been successfully installed, modify app.js and update the bitcoinCommandPath to your bitcoin-cli binary and whether to use the testnet or mainnet:

    bitcoinCommandPath = '/home/example/bitcoin-0.10.2/bin/bitcoin-cli ',
    whichNetworkToUse = 'testnet';
  
Save the changes.  

Running
--------------

**WARNING: the app will not work unless bitcoind is running.**

When you have app.js updated and the modules installed, run the app with:

    node app.js

Once the app is running, you can access the interface at http://localhost:1234

- Add a new sending (origin) address to begin. Once the node has been created corresponding to that address, it can be clicked to direct where its inputs should be sent.
- A "Fee" field allows the user to specify precisely what they will pay as a fee. All other leftover UTXOs are sent to the change address specified on the page.
- On app initialization, a change address is automatically generated for the page; this key can be imported into the local wallet with the Δ button. 
- The "Gear" button will toggle the view of the transaction between a human-readable JSON string, and a raw transaction hash.
- The "Sign" button will sign a transaction that has been generated.
- The "Send" button will propagate a signed transaction to the network.
