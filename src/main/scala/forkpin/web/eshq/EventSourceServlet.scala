package forkpin.web.eshq

import forkpin.web.ForkpinServlet
import com.github.synesso.eshq.{Channel, Key, Secret, EventSourceClient}
import forkpin.Config
import java.net.URL
import org.scalatra.FutureSupport
import scala.concurrent.ExecutionContext

class EventSourceServlet extends ForkpinServlet with FutureSupport {
  val executor: ExecutionContext = ExecutionContext.global

  post("/socket") {
    eventSourceClient.open(Channel(params("channel")))
  }

}
