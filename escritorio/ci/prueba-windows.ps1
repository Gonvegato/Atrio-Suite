# Prueba de Atrio en Windows: Steam y Heroic de mentira, un juego "abierto" y capturas de pantalla
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$tmp = $env:RUNNER_TEMP

# --- Steam de mentira (registro + biblioteca con un juego cuyo .exe es una copia de ping) ---
$steam = Join-Path $tmp 'FakeSteam'
$game = Join-Path $steam 'steamapps\common\JuegoFalso'
New-Item -ItemType Directory -Force -Path $game | Out-Null
Copy-Item "$env:WINDIR\System32\PING.EXE" (Join-Path $game 'JuegoFalso.exe')
@"
"AppState"
{
	"appid"		"1086940"
	"name"		"Baldur's Gate 3"
	"StateFlags"		"4"
	"installdir"		"JuegoFalso"
	"LastPlayed"		"0"
}
"@ | Set-Content -Encoding UTF8 (Join-Path $steam 'steamapps\appmanifest_1086940.acf')
$steamFwd = $steam -replace '\\', '/'
@"
"libraryfolders"
{
	"0"
	{
		"path"		"$($steam -replace '\\', '\\')"
	}
}
"@ | Set-Content -Encoding UTF8 (Join-Path $steam 'steamapps\libraryfolders.vdf')
New-Item -Force -Path 'HKCU:\Software\Valve\Steam' | Out-Null
Set-ItemProperty -Path 'HKCU:\Software\Valve\Steam' -Name SteamPath -Value $steamFwd
Set-ItemProperty -Path 'HKCU:\Software\Valve\Steam' -Name SteamExe -Value "$steamFwd/steam.exe"

# --- Heroic de mentira (%APPDATA%\heroic) ---
$leg = Join-Path $env:APPDATA 'heroic\legendaryConfig\legendary'
New-Item -ItemType Directory -Force -Path $leg | Out-Null
'{"Fortnite":{"title":"Juego de Epic","install_path":"C:\\Games\\Epic","is_dlc":false}}' | Set-Content -Encoding UTF8 (Join-Path $leg 'installed.json')

# --- Juego añadido a mano (otra copia de ping) ---
$own = Join-Path $tmp 'JuegoPropio'
New-Item -ItemType Directory -Force -Path $own | Out-Null
Copy-Item "$env:WINDIR\System32\PING.EXE" (Join-Path $own 'Propio.exe')
$cfgDir = Join-Path $env:LOCALAPPDATA 'Atrio-datos\config\atrio'
New-Item -ItemType Directory -Force -Path $cfgDir | Out-Null
$cfg = @{ customGames = @(@{ id = 'prueba'; name = 'Juego propio'; runner = 'native'; exec = (Join-Path $own 'Propio.exe'); args = '-n 60 127.0.0.1' }) }
$cfg | ConvertTo-Json -Depth 5 | Set-Content -Encoding UTF8 (Join-Path $cfgDir 'config.json')

# --- El juego de Steam "abierto" antes de Atrio (como si lo hubieras lanzado desde Steam) ---
Start-Process -WindowStyle Hidden -FilePath (Join-Path $game 'JuegoFalso.exe') -ArgumentList '-n','90','127.0.0.1'

# --- Atrio en modo capturas ---
$exe = Join-Path $root 'dist\win-unpacked\Atrio.exe'
$shots = Join-Path $root 'capturas'
$env:ATRIO_SHOTS = $shots
$env:ATRIO_SHOT_PLAN = Join-Path $PSScriptRoot 'plan.json'
$env:ATRIO_SIZE = '1600x900'
$env:ATRIO_POWER_DRY = '1'
$p = Start-Process -FilePath $exe -PassThru
if (-not $p.WaitForExit(240000)) { $p.Kill(); throw 'Atrio no ha terminado a tiempo' }
Remove-Item Env:ATRIO_SHOTS, Env:ATRIO_SHOT_PLAN, Env:ATRIO_SIZE

$log = Join-Path $env:LOCALAPPDATA 'Atrio-datos\cache\atrio\atrio.log'
Write-Host '----- atrio.log -----'; Get-Content $log
$play = Join-Path $env:LOCALAPPDATA 'Atrio-datos\data\atrio\playlog.json'
Write-Host '----- playlog.json -----'; Get-Content $play
$pl = Get-Content $play -Raw | ConvertFrom-Json
$keys = @($pl.sessions | ForEach-Object { $_[0] }) + @($pl.active.PSObject.Properties.Name)
if ($keys -notcontains 'steam:1086940') { throw 'No ha detectado el juego de Steam abierto' }
if ($keys -notcontains 'custom:prueba') { throw 'No ha detectado el juego propio lanzado desde Atrio' }
Write-Host 'OK: horas detectadas en Windows'
