param(
    [string]$ServerUrl = "",
    [string]$SdkDir = "C:\Users\Public\AndroidSdk",
    [string]$BuildToolsVersion = "35.0.0"
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
$WorkDir = "C:\Users\Public\flipdoc-android-build"
$BuildTools = Join-Path $SdkDir "build-tools\$BuildToolsVersion"
$AndroidJar = Join-Path $SdkDir "platforms\android-35\android.jar"

$Aapt2 = Join-Path $BuildTools "aapt2.exe"
$D8 = Join-Path $BuildTools "d8.bat"
$ZipAlign = Join-Path $BuildTools "zipalign.exe"
$ApkSigner = Join-Path $BuildTools "apksigner.bat"

if (!(Test-Path $AndroidJar)) {
    throw "Android SDK 35 not found at $AndroidJar"
}

Write-Host "[1/6] Preparing clean ASCII build directory at $WorkDir..."
if (Test-Path $WorkDir) { Remove-Item $WorkDir -Recurse -Force }
New-Item -ItemType Directory -Path "$WorkDir\src\com\flipdoc\app" -Force | Out-Null
New-Item -ItemType Directory -Path "$WorkDir\res\values" -Force | Out-Null
New-Item -ItemType Directory -Path "$WorkDir\obj" -Force | Out-Null
New-Item -ItemType Directory -Path "$WorkDir\gen" -Force | Out-Null
New-Item -ItemType Directory -Path "$WorkDir\dex" -Force | Out-Null
New-Item -ItemType Directory -Path "$WorkDir\out" -Force | Out-Null

Copy-Item "$ScriptDir\AndroidManifest.xml" "$WorkDir\AndroidManifest.xml"
Copy-Item "$ScriptDir\res\values\styles.xml" "$WorkDir\res\values\styles.xml"
Copy-Item "$ScriptDir\src\com\flipdoc\app\*.java" "$WorkDir\src\com\flipdoc\app\"

if ($ServerUrl -ne "") {
    $mainJava = "$WorkDir\src\com\flipdoc\app\MainActivity.java"
    $content = Get-Content $mainJava -Raw -Encoding UTF8
    $content = $content -replace 'DEFAULT_SERVER_URL =\s*"[^"]+"', "DEFAULT_SERVER_URL = `"$ServerUrl`""
    [System.IO.File]::WriteAllText($mainJava, $content, (New-Object System.Text.UTF8Encoding($false)))
    Write-Host "      Embedded default server URL: $ServerUrl"
}

Write-Host "[2/6] Generating multi-density Android launcher icons..."
$env:FD_ICON_SRC = Join-Path $ProjectRoot "public\icon-512.png"
$env:FD_WORK_DIR = $WorkDir
$iconScript = @'
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");
const src = process.env.FD_ICON_SRC;
const workDir = process.env.FD_WORK_DIR;
const densities = [
  ["mipmap-mdpi", 48],
  ["mipmap-hdpi", 72],
  ["mipmap-xhdpi", 96],
  ["mipmap-xxhdpi", 144],
  ["mipmap-xxxhdpi", 192]
];
(async () => {
  for (const [dir, size] of densities) {
    const outDir = path.join(workDir, "res", dir);
    fs.mkdirSync(outDir, { recursive: true });
    await sharp(src).resize(size, size).png().toFile(path.join(outDir, "ic_launcher.png"));
  }
  console.log("Generated all mipmap icons OK");
})();
'@
Push-Location $ProjectRoot
$iconScript | node
if ($LASTEXITCODE -ne 0) { Pop-Location; throw "icon generation failed" }
Pop-Location

Write-Host "[3/6] Compiling Android resources with aapt2..."
& $Aapt2 compile --dir "$WorkDir\res" -o "$WorkDir\out\res.zip"
if ($LASTEXITCODE -ne 0) { throw "aapt2 compile failed" }

& $Aapt2 link `
    -o "$WorkDir\out\unaligned.apk" `
    -I $AndroidJar `
    --manifest "$WorkDir\AndroidManifest.xml" `
    --java "$WorkDir\gen" `
    --min-sdk-version 26 `
    --target-sdk-version 35 `
    --version-code 2 `
    --version-name "1.1.0" `
    "$WorkDir\out\res.zip"
if ($LASTEXITCODE -ne 0) { throw "aapt2 link failed" }

Write-Host "[4/6] Compiling Java sources & converting to DEX with d8..."
$javaFiles = @(
    Get-ChildItem "$WorkDir\src" -Recurse -Filter "*.java" | ForEach-Object { $_.FullName }
    Get-ChildItem "$WorkDir\gen" -Recurse -Filter "*.java" | ForEach-Object { $_.FullName }
)
& javac --release 11 -encoding UTF-8 -classpath $AndroidJar -d "$WorkDir\obj" $javaFiles
if ($LASTEXITCODE -ne 0) { throw "javac failed" }

$classFiles = Get-ChildItem "$WorkDir\obj" -Recurse -Filter "*.class" | ForEach-Object { $_.FullName }
& $D8 --min-api 26 --lib $AndroidJar --output "$WorkDir\dex" $classFiles
if ($LASTEXITCODE -ne 0) { throw "d8 failed" }

Write-Host "[5/6] Packaging classes.dex & aligning APK..."
# Add classes.dex into unaligned.apk (which is a standard ZIP archive)
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::Open("$WorkDir\out\unaligned.apk", "Update")
try {
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, "$WorkDir\dex\classes.dex", "classes.dex", [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
} finally {
    $zip.Dispose()
}

& $ZipAlign -f -p 4 "$WorkDir\out\unaligned.apk" "$WorkDir\out\aligned.apk"
if ($LASTEXITCODE -ne 0) { throw "zipalign failed" }

Write-Host "[6/6] Signing APK with release keystore..."
$KeystorePath = "C:\Users\Public\flipdoc-release.keystore"
if (!(Test-Path $KeystorePath)) {
    & keytool -genkeypair -v `
        -keystore $KeystorePath `
        -storepass "flipdoc2026" `
        -keypass "flipdoc2026" `
        -alias "flipdoc" `
        -keyalg RSA `
        -keysize 2048 `
        -validity 10000 `
        -dname "CN=FlipDoc, OU=Mobile, O=FlipDoc, L=Beijing, ST=Beijing, C=CN"
    if ($LASTEXITCODE -ne 0) { throw "keytool failed" }
}

$SignedApk = "$WorkDir\out\FlipDoc.apk"
& $ApkSigner sign `
    --ks $KeystorePath `
    --ks-pass "pass:flipdoc2026" `
    --key-pass "pass:flipdoc2026" `
    --ks-key-alias "flipdoc" `
    --out $SignedApk `
    "$WorkDir\out\aligned.apk"
if ($LASTEXITCODE -ne 0) { throw "apksigner failed" }

& $ApkSigner verify --print-certs $SignedApk
if ($LASTEXITCODE -ne 0) { throw "apksigner verify failed" }

# Copy to project dist/ and public/FlipDoc.apk for 1-click download on Android!
$DistDir = Join-Path $ProjectRoot "dist"
New-Item -ItemType Directory -Path $DistDir -Force | Out-Null
Copy-Item $SignedApk (Join-Path $DistDir "FlipDoc-轻翻.apk") -Force
Copy-Item $SignedApk (Join-Path $ProjectRoot "public\FlipDoc.apk") -Force

$sizeKB = [Math]::Round((Get-Item $SignedApk).Length / 1024, 1)
Write-Host ""
Write-Host "SUCCESS! Built and verified signed Android APK ($sizeKB KB):"
Write-Host "  - $DistDir\FlipDoc-轻翻.apk"
Write-Host "  - $ProjectRoot\public\FlipDoc.apk"
