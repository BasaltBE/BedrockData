import { HttpRequest, HttpRequestMethod, http } from "@minecraft/server-net"

function sendTags(payload) {
  const request = new HttpRequest("http://127.0.0.1:18080/tags")
  request.setMethod(HttpRequestMethod.Post)
  request.setBody(JSON.stringify(payload))

  http.request(request).then((response) => {
    console.warn(`Tag dump POST status: ${response.status}`)
  }).catch((error) => {
    console.warn(`Tag dump POST failed: ${String(error)}`)
  })
}

export { sendTags }
