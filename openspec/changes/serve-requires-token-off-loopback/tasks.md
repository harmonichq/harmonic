# Tasks — a server reachable from elsewhere requires a token

- [x] 1. Refuse a non-loopback bind with no token, from the flag or the environment.
- [x] 2. Require the token in the compose file and say so in the README.
- [x] 3. Publish no generated documentation on a server with a token.
- [x] 4. Compare the token in constant time, for any header the caller sends.
