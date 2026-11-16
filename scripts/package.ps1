$ErrorActionPreference = 'Stop'
$agentRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$archivePath = Join-Path (Split-Path $agentRoot -Parent) '作息星球-学习智能体-WorkBuddy部署包.zip'
Add-Type -AssemblyName System.IO.Compression
$stream = [System.IO.File]::Open($archivePath, [System.IO.FileMode]::Create)
$archive = [System.IO.Compression.ZipArchive]::new($stream, [System.IO.Compression.ZipArchiveMode]::Create)
$files = @()
foreach ($name in @('package.json','server.js','ai-service.js','Dockerfile','.dockerignore','.gitignore','README.md','启动预览.cmd')) {
    $files += Get-Item -LiteralPath (Join-Path $agentRoot $name)
}
foreach ($folder in @('public','docs','tests','scripts')) {
    $files += Get-ChildItem -LiteralPath (Join-Path $agentRoot $folder) -File -Recurse
}
try {
    foreach ($file in $files) {
        $relative = [System.IO.Path]::GetRelativePath($agentRoot, $file.FullName).Replace('\','/')
        $entry = $archive.CreateEntry('sleep-kmeans-agent/' + $relative, [System.IO.Compression.CompressionLevel]::Optimal)
        $inputStream = [System.IO.File]::OpenRead($file.FullName)
        $outputStream = $entry.Open()
        try { $inputStream.CopyTo($outputStream) } finally { $inputStream.Dispose(); $outputStream.Dispose() }
    }
} finally { $archive.Dispose(); $stream.Dispose() }
$check = [System.IO.Compression.ZipFile]::OpenRead($archivePath)
try {
    if ($check.Entries.Count -ne $files.Count) { throw 'Archive file count mismatch' }
    if ($check.Entries.FullName -match '/(data|artifacts)/|teacher-access|\.env$') { throw 'Unexpected runtime data in package' }
    Write-Output ('Packaged {0} files, {1} bytes: {2}' -f $check.Entries.Count, (Get-Item -LiteralPath $archivePath).Length, $archivePath)
} finally { $check.Dispose() }
