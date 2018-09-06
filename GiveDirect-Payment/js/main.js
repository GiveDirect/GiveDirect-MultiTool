givedirect = {};


givedirect.processForm = function (source, destinations, amount, memo, network, submitButton) {


    var that = this;
    givedirect.operations = [];
    destinations = destinations.trim();


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
    var interstellarMultisigApi = "https://testnet.interstellar.exchange/backend/api/v1/transaction_envelope";

    if (network == "mainnet") {
        isTestnet = false;
        horizonServer = "https://horizon.stellar.org";
        interstellarMultisigApi = "https://interstellar.exchange/backend/api/v1/transaction_envelope";
    }

    if (isTestnet) {
        progressReport.append("TESTNET selected.<br>");
    }
    else {
        progressReport.append("MAINNET selected.<br>");
    }

    progressReport.append("Checking Memo Length <br>");

    if (memo.length > 26) {
        progressReport.append("Memo length: " + memo.length + " &gt 26.<br> Aborting.");
        submitButton.show();
        return;
    }

    progressReport.append("Good. Memo length: " + memo.length + " &lt 26.<br>");

    progressReport.append("Checking Stellar Source Address: " + source + "<br>");

    try {
        var dummy = StellarSdk.Keypair.fromPublicKey(source);
        progressReport.append("Valid Stellar Source Address: " + source + "<br>");
    }
    catch (err) {
        Materialize.toast("Invalid Stellar Source Address", 4000, "red");
        progressReport.append("Oops. Invalid Stellar Source Address: " + source + "<br> Aborting");
        submitButton.show();
        return;
    }

    var invalidDestinations = [];

    var destinationArray = destinations.split("\n");


    //check locally for valid destination accounts.

    for (var i = 0; i < destinationArray.length; i++) {

        var destinationToTest = destinationArray[i];
        progressReport.append((i + 1) + ": Locally Checking Stellar Destination Address: " + destinationToTest + "<br>");

        try {
            var dummy = StellarSdk.Keypair.fromPublicKey(destinationToTest);
        }
        catch (err) {
            console.error(err);
            invalidDestinations.push(destinationToTest);
        }
    }

    if (invalidDestinations.length > 0) {
        progressReport.append("Error: The following destination addresses are invalid: <br> <ul>");

        for (var i = 0; i < invalidDestinations.length; i++) {
            var invalidDestination = invalidDestinations[i];
            progressReport.append("<li>" + invalidDestination + "</li>");
        }

        progressReport.append("</ul>Aborting");
        submitButton.show();
        return;

    }


    progressReport.append("All " + destinationArray.length + " destination addresses are valid. <br> ");
    progressReport.append("... <br> ");
    progressReport.append("Please be patient while we get the latest destination accounts info from the Internet<br> ");
    progressReport.append("... <br> ");
    progressReport.append("... <br> ");

    var server = new StellarSdk.Server(horizonServer);

    givedirect.buildOperations(progressReport, server, destinationArray, amount)
        .then(function (operations) {
            console.log(operations);
            progressReport.append("All " + destinationArray.length + " operations have been created. Getting updated info for the source account <br> ");
            progressReport.append("... <br> ");
            progressReport.append("Please be patient while we get the latest source account information from the Internet<br> ");
            progressReport.append("... <br> ");
            progressReport.append("... <br> ");
            return server.loadAccount(source);
        })
        .then(function (account) {

            if (account.signers.length < 2) {
                progressReport.append("The source account has not been set up for multisig. Aborting.");
                submitButton.show();
                return;
            }

            progressReport.append("Successfully acquired updated source account information from the Internet. <br> ");
            progressReport.append("Building transaction. <br> ");

            var builder = new StellarSdk.TransactionBuilder(account);

            builder = builder.addMemo(StellarSdk.Memo.text(memo));

            for (i = 0; i < givedirect.operations.length; i++) {
                var operation = givedirect.operations[i];
                builder.addOperation(operation);
            }

            transaction = builder.build();

            var xdr = transaction.toEnvelope().toXDR().toString('base64');

            progressReport.append(xdr);
            progressReport.append("<br>... <br> ");
            progressReport.append("Please be patient while we submit your transaction to Interstellar's Multisig Service <br> ");
            progressReport.append("... <br> ");
            progressReport.append("... <br> ");

            $.ajax({
                url: interstellarMultisigApi,
                type: 'post',
                dataType: 'text',
                data: xdr,
                contentType: "text/plain; charset=UTF-8",
                success: function (data) {
                    progressReport.append("Successfully submitted transaction to Interstellar's Multisig Service <br> ");
                }
            });

        })

        .catch(function (err) {

            progressReport.append("There was an error <br> ");
            progressReport.append(JSON.stringify(err) + " <br> ");
            progressReport.append("</ul>Aborting");
            submitButton.show();
            return Promise.reject([]);

        })


}


givedirect.buildOperations = function (progressReport, server, destinations, amount) {

    return new Promise(function (resolve, reject) {

        givedirect.operations = [];

        givedirect.internalBuildOperations(progressReport, server, destinations, amount, 0, resolve, reject);


    });


}

givedirect.internalBuildOperations = function (progressReport, server, destinations, amount, index, resolve, reject) {



    if (givedirect.operations.length == destinations.length) {
        //success.
        resolve(givedirect.operations);
        return;
    }

    if (index >= destinations.length) {
        reject("unknown error");
        return;
    }

    var asset = StellarSdk.Asset.native();


    var destination = destinations[index];
    progressReport.append((index + 1) + ": Remotely Checking Stellar Destination Address: " + destination + "<br>");

    //check remotely whether account is already funded or not.

    server.loadAccount(destination)
        .then(function (account) {

            var operation = StellarSdk.Operation.payment({
                destination: destination,
                asset: asset,
                amount: '' + amount
            });

            givedirect.operations.push(operation);
            progressReport.append((givedirect.operations.length) + ": (FUNDED_ACCOUNT) " + destination + "<br>");

            givedirect.internalBuildOperations(progressReport, server, destinations, amount, index + 1, resolve, reject);
            return;

        })
        .catch(function (err) {
            if (err && err.name && err.name == "NotFoundError") {
                var operation = StellarSdk.Operation.createAccount({
                    destination: destination,
                    startingBalance: '' + amount
                });
                givedirect.operations.push(operation);
                progressReport.append((givedirect.operations.length) + ": (UNFUNDED_ACCOUNT) " + destination + "<br>");
                givedirect.internalBuildOperations(progressReport, server, destinations, amount, index + 1, resolve, reject);
                return;

            }
            else {
                progressReport.append("There was an error getting the status of " + destination + " <br> ");
                console.error(err);
                reject(err);
                return;
            }

        });

}



$(document).ready(function () {

    console.log(StellarSdk);
    console.log(window);

    var form = $("#form");

    form.on("submit", function (event) {
        var submitButton = $("#submitButton");
        var source = $("#source").val();
        var destinations = $("#destinations").val();
        var memo = $("#memo").val();
        var amount = $("#amount").val();
        var network = $("input[name='network']:checked").val();
        event.preventDefault();
        submitButton.hide();
        givedirect.processForm(source, destinations, amount, memo, network, submitButton);
    });

});