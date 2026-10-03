param(
    [string]$JavaHome = '',
    [string]$PlatformDirectory = '',
    [string]$BuildToolsDirectory = ''
)
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
if (!$JavaHome) { $JavaHome = $env:JAVA_HOME }
if (!$JavaHome) { throw 'Set JAVA_HOME to JDK 17 or provide -JavaHome' }
$taskGradleConfig = Get-Content -LiteralPath (Join-Path $taskRoot 'app\build.gradle') -Raw
$taskVersionName = [regex]::Match($taskGradleConfig, "versionName\s+'([^']+)'").Groups[1].Value
$taskVersionCode = [regex]::Match($taskGradleConfig, 'versionCode\s+(\d+)').Groups[1].Value
if (!$taskVersionName -or !$taskVersionCode) { throw 'Missing Android version configuration' }
& node (Join-Path $PSScriptRoot 'sync-assets.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Asset synchronization failed' }
if (!$PlatformDirectory) { $PlatformDirectory = Join-Path $taskRoot '.tools\platform\android-35' }
if (!$BuildToolsDirectory) { $BuildToolsDirectory = Join-Path $taskRoot '.tools\build-tools\android-15' }
$taskBuild = Join-Path $taskRoot 'build\android'
$taskOutput = Join-Path $taskRoot 'build\outputs'
$taskJava = Join-Path $JavaHome 'bin\java.exe'
$taskJavac = Join-Path $JavaHome 'bin\javac.exe'
$taskJar = Join-Path $JavaHome 'bin\jar.exe'
$taskAndroidJar = Join-Path $PlatformDirectory 'android.jar'
foreach ($taskRequired in @($taskJava, $taskJavac, $taskAndroidJar, (Join-Path $BuildToolsDirectory 'aapt2.exe'))) {
    if (!(Test-Path -LiteralPath $taskRequired)) { throw "Missing build dependency: $taskRequired" }
}
function Invoke-Checked([string]$File, [string[]]$Arguments) {
    & $File @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Build command failed: $File ($LASTEXITCODE)" }
}
New-Item -ItemType Directory -Force -Path $taskBuild,$taskOutput,(Join-Path $taskBuild 'classes'),(Join-Path $taskBuild 'dex') | Out-Null
$taskResources = Join-Path $taskBuild 'resources.zip'
$taskUnsigned = Join-Path $taskBuild 'unsigned.apk'
$taskAligned = Join-Path $taskBuild 'aligned.apk'
$taskApk = Join-Path $taskOutput "AI-StudyDesk-Android-$taskVersionName.apk"
$taskManifest = Join-Path $taskBuild 'AndroidManifest.xml'
$taskManifestText = (Get-Content -LiteralPath (Join-Path $taskRoot 'app\src\main\AndroidManifest.xml') -Raw).Replace('<manifest xmlns:', '<manifest package="local.studydesk.android" xmlns:')
[System.IO.File]::WriteAllText($taskManifest, $taskManifestText, [System.Text.UTF8Encoding]::new($false))
Invoke-Checked (Join-Path $BuildToolsDirectory 'aapt2.exe') @('compile','--dir',(Join-Path $taskRoot 'app\src\main\res'),'-o',$taskResources)
Invoke-Checked (Join-Path $BuildToolsDirectory 'aapt2.exe') @('link','-o',$taskUnsigned,'--manifest',$taskManifest,'-I',$taskAndroidJar,'--min-sdk-version','28','--target-sdk-version','35','--version-code',$taskVersionCode,'--version-name',$taskVersionName,'-A',(Join-Path $taskRoot 'app\src\main\assets'),$taskResources)
$taskSources = @(Get-ChildItem -LiteralPath (Join-Path $taskRoot 'app\src\main\java') -Recurse -Filter '*.java' | ForEach-Object { $_.FullName })
Invoke-Checked $taskJavac (@('-encoding','UTF-8','-source','17','-target','17','-classpath',$taskAndroidJar,'-d',(Join-Path $taskBuild 'classes')) + $taskSources)
$taskClasses = Join-Path $taskBuild 'classes.jar'
Invoke-Checked $taskJar @('cf',$taskClasses,'-C',(Join-Path $taskBuild 'classes'),'.')
Invoke-Checked $taskJava @('-cp',(Join-Path $BuildToolsDirectory 'lib\d8.jar'),'com.android.tools.r8.D8','--min-api','28','--lib',$taskAndroidJar,'--output',(Join-Path $taskBuild 'dex'),$taskClasses)
Invoke-Checked $taskJar @('uf',$taskUnsigned,'-C',(Join-Path $taskBuild 'dex'),'classes.dex')
Invoke-Checked 'node' @((Join-Path $PSScriptRoot 'normalize-apk.mjs'),$taskUnsigned)
Invoke-Checked (Join-Path $BuildToolsDirectory 'zipalign.exe') @('-f','4',$taskUnsigned,$taskAligned)
$taskKeystore = Join-Path $taskRoot '.tools\study-debug.jks'
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $taskKeystore) | Out-Null
if (!(Test-Path -LiteralPath $taskKeystore)) {
    Invoke-Checked (Join-Path $JavaHome 'bin\keytool.exe') @('-genkeypair','-keystore',$taskKeystore,'-storepass','android','-keypass','android','-alias','androiddebugkey','-keyalg','RSA','-keysize','2048','-validity','10000','-dname','CN=Android Debug,O=AI-StudyDesk,C=CN')
}
Invoke-Checked $taskJava @('-jar',(Join-Path $BuildToolsDirectory 'lib\apksigner.jar'),'sign','--ks',$taskKeystore,'--ks-key-alias','androiddebugkey','--ks-pass','pass:android','--key-pass','pass:android','--out',$taskApk,$taskAligned)
Invoke-Checked $taskJava @('-jar',(Join-Path $BuildToolsDirectory 'lib\apksigner.jar'),'verify','--verbose',$taskApk)
Write-Output "APK: $taskApk"
