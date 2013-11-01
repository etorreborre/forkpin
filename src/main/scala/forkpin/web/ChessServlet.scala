package forkpin.web

import com.google.api.client.googleapis.auth.oauth2.{GoogleTokenResponse, GoogleCredential}
import com.google.api.services.plus.Plus
import java.math.BigInteger
import java.security.SecureRandom
import org.scalatra._
import forkpin.web.gplus._
import forkpin.persist.Persistent
import com.github.synesso.eshq.Channel
import forkpin.SendMail
import org.json4s.JsonDSL._

class ChessServlet extends ForkpinServlet with GPlusOperations {

  Persistent.create()

  get("/") {
    contentType="text/html"
    val state = new BigInteger(130, new SecureRandom).toString(32)
    session.setAttribute("state", state)
    val display = (params.get("game"), params.get("challenge"), params.get("key")) match {
      case (Some(gameId), _, _) => render(("view" -> "game") ~ ("id" -> gameId))
      case (_, Some(c), Some(k)) => render(("view" -> "challenge") ~ ("id" -> c) ~ ("key" -> k))
      case _ => render("view" -> "all_games")
    }

    jade("index",
      "state" -> state,
      "clientId" -> clientId,
      "pageTitle" -> "chess wip",
      "appName" -> appName,
      "display" -> compact(display))
  }

  post("/connect") {
    authorisedJsonResponse(_ => Ok(reason = "Current user is already connected"),
      if (!params.get("state").equals(session.get("state"))) Unauthorized(reason = "Invalid state parameter")
      else {
        tokenInfoFor(request).fold({
          exception => InternalServerError(reason = s"Failed to read token data from Google: ${exception.getMessage}")
        }, {
          case (tokenResponse, tokenInfo) =>
            if (tokenInfo.containsKey("error")) Unauthorized(reason = tokenInfo.get("error").toString)
            else if (!request.getParameter("gplus_id").equals(tokenInfo.getUserId)) Unauthorized(reason = "Token's user ID doesn't match given user ID")
            else if (!clientId.equals(tokenInfo.getIssuedTo)) Unauthorized(reason = "Token's client ID does not match app's")
            else {
              session.setAttribute("token", tokenResponse)
              val user = Persistent.userOrBuild(tokenInfo.getUserId, new PeopleService(tokenResponse.toString))
              session.setAttribute("user", user)
              Ok(reason = "Successfully connected user")
            }
        })
      }
    )
  }

  post("/disconnect") {
    authorisedJsonResponse {token =>
      revoke(token, request).fold({
        exception => InternalServerError(reason = s"Failed to read token data from Google: ${exception.getMessage}")
      }, {
        response =>
          session.remove("token")
          session.remove("user")
          Ok(reason = "Successfully disconnected user")
      })
    }
  }

  get("/profile/:id") {
    authorisedJsonResponse {token =>
      Ok(s"${new PeopleService(token.value).get(params("id"))}")
    }
  }

  get("/people") {
    authorisedJsonResponse {token =>
      val credential = new GoogleCredential.Builder().setJsonFactory(jsonFactory).setTransport(transport)
        .setClientSecrets(clientId, clientSecret).build.setFromTokenResponse(
        jsonFactory.fromString(token.value, classOf[GoogleTokenResponse]))
      val plusService = new Plus.Builder(transport, jsonFactory, credential).setApplicationName(appName).build
      val fields = "items(displayName,id,image,name(familyName,givenName),nickname),nextPageToken,totalItems"
      val peopleFinder = plusService.people.list("me", "visible").setFields(fields)
        .set("pageToken", params("pageToken")).set("orderBy", "alphabetical")
      val peopleFeed = peopleFinder.execute
      Ok(s"$peopleFeed")
    }
  }

  post("/challenge/email") {
    authorisedJsonResponse {token =>
      val email = params("email")
      val challenge = Persistent.createChallenge(user, email)
      SendMail.send(challenge, baseUrl)
      Ok(reason = s"Created $challenge", body = challenge)
    }
  }

  get("/challenge/:id") {
    jsonResponse {
      val challengeId = params("id").toInt
      val key = params("key")
      Persistent.challenge(challengeId, key).map{c => Ok(reason = "we got one!!", body = s"${c.forClient}")}
        .getOrElse(NotFound(reason = "Challenge/key combination not found", body = s"{challenge: $challengeId, key: $key}"))
    }
  }

//  post("/challenge") {
//    authorisedJsonResponse {token =>
//      val challenge = Persistent.createChallenge(user, Persistent.user(params("gPlusId")))
//      Ok(reason = s"Created $challenge", body = challenge)
//    }
//  }

  get("/games") {
    authorisedJsonResponse {token =>
      val games = Persistent.games(user)
      Ok(reason = s"Retrieved games for $user", body = games.map(_.forClient))
    }
  }

  post("/move") {
    authorisedJsonResponse {token =>
      val (gameId, from, to) = (params("gameId"), params("from"), params("to"))
      Persistent.game(gameId.toInt).map{game =>
        game.move(from, to).fold(
          (invalidMove) => Forbidden(reason = "Invalid move", body = invalidMove.forClient),
          (updatedGame) => {
            Persistent.updateGame(updatedGame)
            eventSourceClient.sendJson(Channel(s"forkpin-game-$gameId"), updatedGame.forClient)
            Ok(updatedGame.forClient)
          }
        )
      }.getOrElse(Forbidden(reason = "Invalid gameId", body = gameId))
    }
  }

}
