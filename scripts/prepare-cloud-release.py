#!/usr/bin/env python3
"""Build an immutable Linux App Service ZIP from one reviewed Git commit.

Does not start the app, access Azure, migrate a database or read local settings.
Requires .NET 10, Python 3.12+ and official nodejs.org download access.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tarfile
import tempfile
import urllib.request
import zipfile


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def run(*args, cwd=None, capture=False, env=None):
    result = subprocess.run(args, cwd=cwd, env=env, check=True,
                            text=True, stdout=subprocess.PIPE if capture else None)
    return result.stdout.strip() if capture else None


def sha256(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def download(url, target):
    with urllib.request.urlopen(url, timeout=120) as response, target.open('wb') as stream:
        require(response.url.startswith('https://nodejs.org/'), 'Unexpected Node download redirect')
        shutil.copyfileobj(response, stream)


def package(repo, source_sha, output, node_version):
    require(re.fullmatch(r'[0-9a-f]{40}', source_sha), 'Use the full lowercase Git SHA')
    require(re.fullmatch(r'24\.\d+\.\d+', node_version), 'Use an exact reviewed Node 24 version')
    require(run('git', 'rev-parse', 'HEAD', cwd=repo, capture=True) == source_sha,
            'Checkout the exact source SHA before packaging')
    # The archive is the only source input; ignored files and uncommitted edits cannot enter it.
    epoch = int(run('git', 'show', '-s', '--format=%ct', source_sha, cwd=repo, capture=True))
    commit_time = datetime.fromtimestamp(epoch, timezone.utc).isoformat()
    output = output.resolve()
    require(not output.exists() or not any(output.iterdir()), 'Output directory must be empty')
    output.mkdir(parents=True, exist_ok=True)
    build = 'git-' + source_sha
    with tempfile.TemporaryDirectory(prefix='banking-release-') as temp:
        work = Path(temp)
        source, payload = work / 'source', work / 'payload'
        source.mkdir()
        source_tar = work / 'source.tar'
        run('git', 'archive', '--format=tar', '--output=' + str(source_tar), source_sha, cwd=repo)
        with tarfile.open(source_tar) as archive:
            archive.extractall(source, filter='data')
        run('dotnet', 'restore', str(source / 'src/Banking.Api/Banking.Api.csproj'),
            '--runtime', 'linux-x64', '--locked-mode', cwd=source)
        run('dotnet', 'publish', str(source / 'src/Banking.Api/Banking.Api.csproj'),
            '--no-restore', '--configuration', 'Release', '--runtime', 'linux-x64',
            '--self-contained', 'false', '--output', str(payload),
            '-p:ContinuousIntegrationBuild=true', '-p:InformationalVersion=' + build,
            '-p:IncludeSourceRevisionInInformationalVersion=false',
            '-p:SourceRevisionId=' + source_sha, cwd=source)
        (payload / 'appsettings.Development.json').unlink(missing_ok=True)
        advisor = payload / 'advisor'
        advisor.mkdir()
        for module in sorted((source / 'prototypes/advisor').glob('*.mjs')):
            if not module.name.endswith(('.test.mjs', '-fixture.mjs')):
                shutil.copyfile(module, advisor / module.name)
        for folder in ('public', 'examples'):
            shutil.copytree(source / 'prototypes/advisor' / folder, advisor / folder)
        shutil.copyfile(source / 'scripts/start-cloud.sh', payload / 'start-cloud.sh')
        # Fetch the portable Linux runtime, never a host-specific binary or a historical artifact.
        filename = f'node-v{node_version}-linux-x64.tar.xz'
        base = f'https://nodejs.org/dist/v{node_version}/'
        sums, node_tar = work / 'SHASUMS256.txt', work / filename
        download(base + 'SHASUMS256.txt', sums)
        expected = [line.split()[0] for line in sums.read_text().splitlines()
                    if line.split()[-1] == filename]
        require(len(expected) == 1 and re.fullmatch(r'[0-9a-f]{64}', expected[0]),
                'Official Node checksum missing or invalid')
        download(base + filename, node_tar)
        require(sha256(node_tar) == expected[0], 'Node distribution checksum mismatch')
        runtime = payload / 'runtime'
        runtime.mkdir()
        with tarfile.open(node_tar) as archive:
            for source_name, target_name in (('bin/node', 'node'), ('LICENSE', 'LICENSE.node')):
                member = archive.getmember(f'node-v{node_version}-linux-x64/{source_name}')
                require(member.isfile(), 'Unexpected Node archive member')
                with archive.extractfile(member) as stream, (runtime / target_name).open('wb') as target:
                    shutil.copyfileobj(stream, target)
        for executable in (runtime / 'node', payload / 'start-cloud.sh'):
            executable.chmod(0o755)
        require(run(str(runtime / 'node'), '--version', capture=True) == 'v' + node_version,
                'Packaged Node version mismatch')
        run(str(runtime / 'node'), '--check', str(advisor / 'server.mjs'))
        # Import the complete runtime graph; server's entrypoint guard prevents starting services.
        env = dict(os.environ, BANKING_ASSET_ROOT=str(payload / 'wwwroot'))
        run(str(runtime / 'node'), '--input-type=module', '-e',
            'await import(' + json.dumps((advisor / 'server.mjs').as_uri()) + ')', env=env)
        metadata = dict(schemaVersion=1, sourceSha=source_sha, build=build,
                        commitTime=commit_time, nodeVersion=node_version)
        (payload / 'banking-release.json').write_text(json.dumps(metadata, indent=2) + '\n')
        required = ('Banking.Api.dll', 'Banking.Api.runtimeconfig.json', 'appsettings.json',
                    'wwwroot/index.html', 'wwwroot/saxo-session.js', 'advisor/server.mjs',
                    'runtime/node', 'start-cloud.sh', 'banking-release.json')
        require(all((payload / name).is_file() for name in required), 'Incomplete release payload')
        private = re.compile(r'(?:^|/)(?:\.env(?:\..*)?|appsettings\.(?:Local|Development)\.json)$'
                             r'|\.(?:dpapi|pfx|pem|p12|key|mdf|ldf|db|sqlite|log)$'
                             r'|(?:\.test\.mjs|-fixture\.mjs)$', re.I)
        files = []
        for path in sorted(payload.rglob('*')):
            require(not path.is_symlink(), 'Symlink found in release payload')
            if not path.is_file():
                continue
            name = path.relative_to(payload).as_posix()
            require(not private.search(name), 'Private/development/test file in package: ' + name)
            require('node_modules' not in path.parts, 'node_modules must not enter the release')
            files.append(dict(path=name, sha256=sha256(path), size=path.stat().st_size))
        zip_path = output / 'banking-release.zip'
        zip_time = datetime.fromtimestamp(max(epoch, 315532800), timezone.utc).timetuple()[:6]
        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
            for entry in files:
                info = zipfile.ZipInfo(entry['path'], date_time=zip_time)
                info.create_system = 3
                mode = 0o755 if entry['path'] in ('runtime/node', 'start-cloud.sh') else 0o644
                info.external_attr = (0o100000 | mode) << 16
                archive.writestr(info, (payload / entry['path']).read_bytes(),
                                 compress_type=zipfile.ZIP_DEFLATED, compresslevel=6)
        manifest = metadata | dict(nodeDistributionSha256=expected[0], files=files,
                                   archive=dict(name=zip_path.name, sha256=sha256(zip_path),
                                                size=zip_path.stat().st_size))
        manifest_path = output / 'manifest.json'
        manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
        (output / 'checksums.txt').write_text(''.join(
            sha256(path) + '  ' + path.name + '\n' for path in (zip_path, manifest_path)))
        print(json.dumps(dict(sourceSha=source_sha, build=build, files=len(files),
                              archive=manifest['archive'], output=str(output))))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sha', required=True)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--node-version', default='24.19.0')
    args = parser.parse_args()
    repo = Path(run('git', 'rev-parse', '--show-toplevel', capture=True))
    package(repo, args.sha, args.output, args.node_version)


if __name__ == '__main__':
    main()
