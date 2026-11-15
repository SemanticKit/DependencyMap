/* One request to the app. Gives the answer as JSON; when the app answers with an error, its message is thrown. */
export async function request(method, url, payload) {
  const options = { method, cache: 'no-store' };
  if (payload !== undefined) {
    options.headers = { 'content-type': 'application/json' };
    options.body = JSON.stringify(payload);
  }
  const response = await fetch(url, options);
  const answer = await response.json();
  if (!response.ok) throw new Error(answer.message || 'The app answered ' + response.status);
  return answer;
}
