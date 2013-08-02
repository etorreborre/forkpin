var helper = (function() {
    var authResult = undefined;
    var divs = {'userName': $('#userName'), 'selfPanel': $('#selfPanel'), 'opponentPanel': $('#opponentPanel')};

    return {
        /**
         * Hides the sign-in button and connects the server-side app after
         * the user successfully signs in.
         *
         * @param {Object} authResult An Object which contains the access token and
         *   other authentication information.
         */
        onSignInCallback: function(authResult) {
            if (authResult['access_token']) {
                // The user is signed in
                this.authResult = authResult;
                // After we load the Google+ API, render the profile data from Google+.
                gapi.client.load('plus','v1',this.renderProfile);
                $('#gDisconnect').show();
            } else if (authResult['error']) {
                // There was an error, which means the user is not signed in.
                // As an example, you can troubleshoot by writing to the console:
                console.log('There was an error: ' + authResult['error']);
                $('#gConnect').show();
            }
            console.log('authResult', authResult);
        },
        /**
         * Retrieves and renders the authenticated user's Google+ profile.
         */
        renderProfile: function() {
            var request = gapi.client.plus.people.get( {'userId' : 'me'} );
            request.execute( function(profile) {
                divs.userName.empty();
                divs.selfPanel.empty();
                if (profile.error) {
                    divs.selfPanel.append(profile.error);
                    return;
                }
                helper.connectServer(profile.id);
                divs.userName.append(profile.displayName);
                divs.selfPanel.append('<img src="' + profile.image.url + '" class="img-circle"/>');
                $('#gConnect').hide();
                $('#userMenu').show();
            });
        },
        /**
         * Calls the server endpoint to disconnect the app for the user.
         */
        disconnectServer: function() {
            // Revoke the server tokens
            console.log(window.location.origin + '/disconnect');
            $.ajax({
                type: 'POST',
                url: window.location.origin + '/disconnect',
                async: false,
                success: function(result) {
                    $('#visiblePeople').empty();
                    $('#gConnect').show();
                    $('#userMenu').hide();
                },
                error: function(e) {
                    console.log(e);
                }
            });
        },
        /**
         * Calls the server endpoint to connect the app for the user. The client
         * sends the one-time authorization code to the server and the server
         * exchanges the code for its own tokens to use for offline API access.
         * For more information, see:
         *   https://developers.google.com/+/web/signin/server-side-flow
         */
        connectServer: function(gplusId) {
            url = window.location.origin + '/connect?state=' + gplusOneTimeToken + '&gplus_id=' + gplusId;
            console.log('connectServer -> ', url);
            $.ajax({
                type: 'POST',
                url: url,
                contentType: 'application/octet-stream; charset=utf-8',
                success: function(result) {
                    // helper.people();
                },
                error: function(e) {
                    console.log('error connecting:', e.status, e.statusText);
                },
                processData: false,
                data: this.authResult.code
            });
        },
        /**
         * Calls the server endpoint to get the list of people visible to this app.
         */
        people: function() {
            $.ajax({
                type: 'GET',
                url: window.location.origin + '/people',
                contentType: 'application/octet-stream; charset=utf-8',
                success: function(result) {
                    helper.appendCircled(result);
                },
                error: function(e) {
                    console.log('error getting people list', e);
                }
            });
        },
        /**
         * Displays visible People retrieved from server.
         *
         * @param {Object} people A list of Google+ Person resources.
         */
        appendCircled: function(people) {
            $('#visiblePeople').empty().append('Number of people visible to this app: ' + people.totalItems + '<br/>');
            for (var personIndex in people.items) {
                person = people.items[personIndex];
                $('#visiblePeople').append('<img src="' + person.image.url + '" title="' + person.displayName + '">');
            }
        },

        issueChallenge: function() {
            $.ajax({
                type: 'GET',
                url: window.location.origin + '/challenge',
                contentType: 'application/octet-stream; charset=utf-8',
                success: function(result) {
                    console.log('challenge issued:', result);
                },
                error: function(e) {
                    console.log('error issuing challenge', e);
                }
            })
        }
    };
})();

var board;
var fen = '';

$(document).ready(function() {
    $('#gDisconnect').click(helper.disconnectServer);
    board = new ChessBoard('chessboard', fen);
    $('#chessboard').fadeTo('slow', 0.25);
    $('#playButton').click(helper.issueChallenge);
});

$(window).resize(function() {
    board = new ChessBoard('chessboard', fen);
});

/**
 * Calls the helper method that handles the authentication flow.
 *
 * @param {Object} authResult An Object which contains the access token and
 *   other authentication information.
 */
function onSignInCallback(authResult) {
    helper.onSignInCallback(authResult);
}