"""Inspect an explicitly selected production jar; never print resource contents."""
from pathlib import Path
import sys
import zipfile

root = Path(__file__).resolve().parent.parent
artifact = Path(sys.argv[1]) if len(sys.argv) == 2 else root / 'backend/standalone-backend/target/standalone-backend-0.1.0-SNAPSHOT.jar'
with zipfile.ZipFile(artifact) as jar:
    names = jar.namelist()
    libraries = [name.rsplit('/', 1)[-1] for name in names if name.startswith('BOOT-INF/lib/')]
    assert not any(any(part in name.lower() for part in ('eureka', 'spring-cloud', 'springdoc')) or name.startswith('h2-') for name in libraries)
    assert not any(name.endswith(('.pem', '.key', '.p12', '.pfx', '.jks')) or 'application-isolated' in name or 'EphemeralSigningKeys' in name or 'StandaloneTransactionProbe' in name for name in names)
    assert 'Start-Class: com.mediconnect.standalone.StandaloneBackendApplication' in jar.read('META-INF/MANIFEST.MF').decode()
    migrations = 0
    for unit in ('auth', 'patient', 'doctor', 'appointment'):
        for source in (root / f'backend/{unit}-service/src/main/resources/db/migration').glob('*.sql'):
            assert jar.read(f'BOOT-INF/classes/db/{unit}/{source.name}') == source.read_bytes()
            migrations += 1
    assert migrations == 5
print('PASS: standalone production jar, five unchanged migrations, no test keys/profile/H2, no Eureka/Spring Cloud/OpenAPI UI runtime.')
