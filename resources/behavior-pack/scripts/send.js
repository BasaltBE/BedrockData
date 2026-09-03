import { HttpRequest, HttpRequestMethod, http } from "@minecraft/server-net"

async function dropMode() {
  const request = new HttpRequest("http://127.0.0.1:18080/mode")
  request.setMethod(HttpRequestMethod.Get)
  const response = await http.request(request)
  return response.status === 202
}

function sendTags(payload) {
  const request = new HttpRequest("http://127.0.0.1:18080/tags")
  request.setMethod(HttpRequestMethod.Post)
  request.setBody(JSON.stringify(payload))

  return http.request(request)
}

export { dropMode, sendTags }
