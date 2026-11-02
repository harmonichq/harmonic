# A server reachable from elsewhere requires a token

## Why

Harmonic is a public repository anyone can self-host, and its compose file
publishes the server's port with the token commented out. Following the default
setup leaves one person's glucose and insulin history readable by anyone who can
reach that port. The specification already says such a deployment must set a
token; nothing enforced it.

## What changes

- The server refuses to start on a non-loopback address with no token.
- The compose file requires a token rather than suggesting one.
- A server with a token publishes no generated API documentation, because a page
  load cannot carry the token.
- The token is compared in constant time.

## Impact

An existing install that binds beyond loopback with no token, which includes
every container that never set one, stops starting until it sets a token.
