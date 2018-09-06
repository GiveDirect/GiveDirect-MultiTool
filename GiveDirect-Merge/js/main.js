givedirect = {};


givedirect.processForm = function (destination, sources, network, submitButton) {


    console.log(submitButton);

    var that = this;
    givedirect.operations = [];
    sources = sources.trim();


    var progressReport = $("#progressReport");
    progressReport.html("");

    progressReport.append("<strong>Progress Report</strong><br>");

    progressReport.append("Checking Network <br>");

    if (!network) {
        progressReport.append("Select either testnet or mainnet.<br> Aborting.");
        submitButton.show();
        return;
    }

    var isTestnet = true;
    var horizonServer = "https://horizon-testnet.stellar.org";
    StellarSdk.Network.useTestNetwork();

    if (network == "mainnet") {
        isTestnet = false;
        horizonServer = "https://horizon.stellar.org";
        StellarSdk.Network.usePublicNetwork();

    }

    if (isTestnet) {
        progressReport.append("TESTNET selected.<br>");
    }
    else {
        progressReport.append("MAINNET selected.<br>");
    }


    progressReport.append("Checking Stellar Destination Address: " + destination + "<br>");

    try {
        var dummy = StellarSdk.Keypair.fromPublicKey(destination);
        progressReport.append("Valid Stellar Destination Address: " + destination + "<br>");
    }
    catch (err) {
        Materialize.toast("Invalid Stellar Destination Address", 4000, "red");
        progressReport.append("Oops. Invalid Stellar Destination Address: " + destination + "<br> Aborting");
        submitButton.show();
        return;
    }

    var invalidLines = [];
    var validSources = [];

    var sourceArray = sources.split("\n");


    //check locally for valid private keys.

    for (var i = 0; i < sourceArray.length; i++) {

        //regex to extract secret key.

        var reg = /(S[A-Z0-9]{55})/;
        var results = reg.exec(sourceArray[i]);
        if (results == null) {
            invalidLines.push(sourceArray[i]);
            continue;
        }

        console.log(results);


        var secretKey = results[0];

        try {
            var dummy = StellarSdk.Keypair.fromSecret(secretKey);
            progressReport.append("Valid Secret Key: " + secretKey + "<br>");
        }
        catch (err) {
            console.log(err);
            Materialize.toast("Invalid Stellar Secret Key", 4000, "red");
            progressReport.append("Oops. Invalid Stellar Secret Key: " + secretKey + "<br> Aborting");
            submitButton.show();
            return;
        }
        validSources.push(secretKey);
        // var destinationToTest = sourceArray[i];
        // progressReport.append((i + 1) + ": Locally Checking Stellar Destination Address: " + destinationToTest + "<br>");



        // try {
        //     var dummy = StellarSdk.Keypair.fromPublicKey(destinationToTest);
        // }
        // catch (err) {
        //     console.error(err);
        //     invalidDestinations.push(destinationToTest);
        // }
    }

    var server = new StellarSdk.Server(horizonServer);


    givedirect.mergeAccounts(destination, validSources, 0, server, progressReport, submitButton);


    var server = new StellarSdk.Server(horizonServer);



}

givedirect.mergeAccounts = function (destination, sources, indexToProcess, server, progressReport, submitButton) {

    if (indexToProcess >= sources.length) {
        progressReport.append("<br> Done.");
        console.log(submitButton);
        submitButton.show();
        return;//done.
    }

    var source = sources[indexToProcess];

    givedirect.getAccountDetailsFromSecretKey(source, server, progressReport)
        .then(function (account) {
            return givedirect.performMergeOperations(source, destination, account, progressReport, server);
        })

        .catch(function (err) {
            console.error(err);
            return Promise.resolve();
        })
        .then(function () {
            setTimeout(function () {
                indexToProcess++;
                givedirect.mergeAccounts(destination, sources, indexToProcess, server, progressReport, submitButton);
            }, 0);
        });

    //first pass... send all non xlm assets to destination.
    //second pass... delete all trustlines
    //third pass... merge account.



}

givedirect.getAccountDetailsFromSecretKey = function (source, server, progressReport) {
    return new Promise((resolve, reject) => {



        var sourceAccount = StellarSdk.Keypair.fromSecret(source);
        progressReport.append("... <br> ");
        progressReport.append("Please be patient while we get the latest account info for " + source + " <br> ");
        progressReport.append("... <br> ");
        progressReport.append("... <br> ");
        //remotely get account details.
        server.loadAccount(sourceAccount.publicKey())
            .then(function (account) {
                console.log(account);
                progressReport.append(": (REMOTE ACCOUNT DETAILS OBTAINED FOR ) " + source + "<br>");

                resolve(account);
            })
            .catch(function (err) {
                console.error(err);

                if (err && err.name && err.name == "NotFoundError") {
                    progressReport.append(": (UNFUNDED_ACCOUNT) " + source + "<br>");
                }
                else {
                    progressReport.append("There was an error getting the status of " + source + " <br> ");
                }
                reject(err);
            })



    });
}

givedirect.performMergeOperations = function (source, destination, accountDetails, progressReport, server) {
    return new Promise((resolve, reject) => {




        console.log(accountDetails);

        var operations = [];

        let balances = accountDetails.balances;

        for (var i = 0; i < balances.length; i++) {
            var balance = balances[i];
            var asset = StellarSdk.Asset.native();
            var isCustom = false;
            try {
                asset = new StellarSdk.Asset(balance.asset_code, balance.asset_issuer);
                isCustom = true;
            } catch (err) {
            }
            if (isCustom) {

                //send asset to destination.

                if (balance.balance > 0) {
                    operations.push(StellarSdk.Operation.payment({
                        destination: destination,
                        asset: asset,
                        amount: '' + balance.balance
                    }));
                }


                ///remove trustline.
                operations.push(StellarSdk.Operation.changeTrust({
                    "asset": asset,
                    "limit": "0"
                }));

            }


        }

        operations.push(StellarSdk.Operation.accountMerge({
            destination: destination
        }));

        var builder = new StellarSdk.TransactionBuilder(accountDetails);


        for (i = 0; i < operations.length; i++) {
            var operation = operations[i];
            builder.addOperation(operation);
        }

        transaction = builder.build();
        transaction.sign(StellarSdk.Keypair.fromSecret(source));

        var xdr = transaction.toEnvelope().toXDR().toString('base64');

        console.log(xdr);

        progressReport.append("... <br> ");
        progressReport.append("Please be patient while we submit merge operations for " + source + " <br> ");
        progressReport.append("... <br> ");
        progressReport.append("... <br> ");

        server.submitTransaction(transaction).then(function (transactionResponse) {
            progressReport.append(":) Merge successful for  " + source + "<br>");

            resolve(transactionResponse);
        })
            .catch(function (err) {
                progressReport.append(":( Merge unsuccessful for " + source + "<br>");

                reject(err);
            });



    });
}






$(document).ready(function () {

    console.log(StellarSdk);
    console.log(window);

    var form = $("#form");

    form.on("submit", function (event) {
        var submitButton = $("#submitButton");
        var destination = $("#destination").val();
        var accounts = $("#accounts").val();
        var network = $("input[name='network']:checked").val();
        event.preventDefault();
        submitButton.hide();
        givedirect.processForm(destination, accounts, network, submitButton);
    });

});