var chessboard = (function() {

    var config = {
        draggable: true,
        snapbackSpeed: 'fast',
        showErrors: 'true'
    };

    var board = new ChessBoard('chessboard', config);

    return {

        focus: game,

        focusOn: function(game) {
            this.focus = game;
            board.position(game.san());
            config.onDragStart = function(source) {
                config.validMovesForPiece = game.validMovesFrom(source);
                return config.validMovesForPiece.length > 0;
            };
            config.onDrop = function(from, to) {
                var result = game.move({from: from, to: to});
                if (result != null) {
                    $.ajax({
                        type: 'POST',
                        url: window.location.origin + '/move',
                        contentType: 'application/x-www-form-urlencoded; charset=utf-8',
                        success: function (result) {
                            console.log('ok posting move', result);
                        },
                        error: function (e) {
                            // todo - here the client has moved, but server doesn't know. rollback/report.
                            console.log('error posting move', e.responseText);
                        },
                        data: {gameId: game.id, from: from.toUpperCase(), to: to.toUpperCase()}
                    });
                    return false;
                }
                return 'snapback';
            };
            // todo - onSnapEnd is required to sync the board to the game state where move has side-effects.
        },

        update: function(game) {
            if (game.id === this.focus.id) {
                var fen = game.fen;
                var san = fen.substring(0, fen.indexOf(' '));
                if (board.fen() !== san) {
                    board.position(san);
                }
            }
        }

    }

})();


var gameControls = (function () {
    return {
        loadGamesForUser: function () {
            $.ajax({
                type: 'GET',
                url: window.location.origin + '/games',
                success: function (games) {
                    console.log("Games for current user:", games);
                    if (games.length > 0) {
                        chessboard.focusOn(game(games[0]));
                    }
                },
                error: function (e) {
                    console.log('error loading games', e);
                }
            })
        }
    }
})();


var game = function(meta, existingEngine) {

    var engine = existingEngine || (function() {
        var e = new Chess(meta.fen);
        e.san = function() {
            var fen = e.fen();
            return fen.substring(0, fen.indexOf(' '));
        };
        e.update = function(game) {
            var lastMove = game.moves.slice(game.moves.length - 1);
            this.move(lastMove.from, lastMove.to);
        };
        return e;
    })();

    return {

        id: meta.id,

        engine: engine,

        playerColour: function() {
            if (loginMod.player.id == meta.white) {
                return "w";
            } else if (loginMod.player.id == meta.black) {
                return "b";
            }
            return undefined;
        },

        validMovesFrom: function(source) {
            if (this.engine.turn() == this.playerColour()) {
                var moves = this.engine.moves({square: source});
                var toCoordinates = function (s) {
                    return s.substring(s.length - 2);
                };
                return $.map(moves, toCoordinates);
            } else {
                return [];
            }
        },

        move: function(from, to) {
            return this.engine.move(from, to);
        },

        san: engine.san,

        eventSource: (function() {
            var eshq = new ESHQ("forkpin-game-" + meta.id);
            eshq.onmessage = function (e) {
                var gameData = JSON.parse(e.data);
                console.log("game update", gameData);
                engine.update(gameData);
                chessboard.update(gameData);
            };
            return eshq;
        })()

    };
};