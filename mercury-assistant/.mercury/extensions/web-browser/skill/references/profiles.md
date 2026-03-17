# Profile Management

When running `pinchtab`, profiles are managed via the dashboard API on port 9867.

## List profiles

```bash
curl http://localhost:9867/profiles
```

## Start a profile

```bash
curl -X POST http://localhost:9867/profiles/<ID>/start
```

Returns instance info including allocated `port`. Use that port for subsequent API calls:

```bash
PINCHTAB_URL=http://localhost:9868 pinchtab snap -i
```

## Typical agent flow

For simple single-instance use (default), just run `pinchtab &` — it starts on port 9867. No profile management needed.
