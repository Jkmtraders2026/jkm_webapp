"""Validate deployment settings and write a private, temporary function env file."""
import os
import re
from pathlib import Path
from urllib.parse import urlsplit


def main():
    names = ['SUPABASE_ACCESS_TOKEN', 'SUPABASE_DB_PASSWORD', 'SUPABASE_PROJECT_REF',
             'ALLOWED_ORIGINS', 'TURNSTILE_SECRET_KEY']
    missing = [key for key in names if not os.environ.get(key, '').strip()]
    if missing:
        raise SystemExit('Missing deployment settings: ' + ', '.join(missing))
    if not re.fullmatch(r'[a-z0-9]{20}', os.environ['SUPABASE_PROJECT_REF']):
        raise SystemExit('Use the project reference from the selected Supabase project.')
    origins = [x.strip() for x in os.environ['ALLOWED_ORIGINS'].split(',')]
    for origin in origins:
        url = urlsplit(origin)
        if not re.fullmatch(r'https://[a-zA-Z0-9.-]+(?::[0-9]+)?', origin) or url.scheme != 'https' or not url.hostname or url.username or url.password or url.path or url.query or url.fragment:
            raise SystemExit('ALLOWED_ORIGINS must contain exact HTTPS origins without trailing slashes.')
    secret = os.environ['TURNSTILE_SECRET_KEY']
    if '\n' in secret or '\r' in secret:
        raise SystemExit('Invalid Turnstile secret format.')
    path = Path(os.environ['RUNNER_TEMP']) / 'jkm-backend.env'
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, 'w') as file:
        file.write('ALLOWED_ORIGINS=' + ','.join(origins) + '\nTURNSTILE_SECRET_KEY=' + secret + '\n')
    print('Deployment settings validated. No secret values are printed.')


if __name__ == '__main__':
    main()
