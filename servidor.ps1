# ══════════════════════════════════════════════════════════════════════════
#  servidor.ps1 — Sirve Reportes en http://localhost:8123 y abre Chrome.
#
#  Chrome solo ofrece «Instalar app» cuando la página viene de una dirección
#  segura. localhost cuenta como segura, así que con esto la app se instala
#  sin necesidad de publicarla en internet ni de crear ninguna cuenta.
#
#  Para detenerla: cerrá esta ventana.
# ══════════════════════════════════════════════════════════════════════════

param([switch]$SinNavegador)

$puerto = 8123
$raiz = Split-Path -Parent $MyInvocation.MyCommand.Path
$prefijo = "http://localhost:$puerto/"

$tipos = @{
  '.html'        = 'text/html; charset=utf-8'
  '.css'         = 'text/css; charset=utf-8'
  '.js'          = 'text/javascript; charset=utf-8'
  '.json'        = 'application/json; charset=utf-8'
  '.webmanifest' = 'application/manifest+json; charset=utf-8'
  '.png'         = 'image/png'
  '.jpg'         = 'image/jpeg'
  '.svg'         = 'image/svg+xml'
  '.ico'         = 'image/x-icon'
  '.woff2'       = 'font/woff2'
  '.md'          = 'text/plain; charset=utf-8'
}

function Abrir-Navegador($url) {
  $rutas = @(
    (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'),
    (Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe'),
    (Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe')
  )
  foreach ($ruta in $rutas) {
    if ($ruta -and (Test-Path $ruta)) { Start-Process $ruta $url; return }
  }
  Start-Process $url   # el navegador que tenga por defecto
}

$escucha = New-Object System.Net.HttpListener
$escucha.Prefixes.Add($prefijo)

try {
  $escucha.Start()
} catch {
  Write-Host ''
  Write-Host "  El puerto $puerto ya está ocupado." -ForegroundColor Yellow
  Write-Host '  Puede que Reportes ya este corriendo. Abriendo el navegador...'
  Abrir-Navegador $prefijo
  Start-Sleep -Seconds 3
  exit
}

Write-Host ''
Write-Host '  Reportes corriendo' -ForegroundColor Green
Write-Host "  $prefijo" -ForegroundColor Green
Write-Host ''
Write-Host '  Cerra esta ventana para detenerla.' -ForegroundColor DarkGray
Write-Host ''

if (-not $SinNavegador) { Abrir-Navegador $prefijo }

while ($escucha.IsListening) {
  try {
    $contexto = $escucha.GetContext()
  } catch {
    break
  }

  $peticion = $contexto.Request
  $respuesta = $contexto.Response

  try {
    $relativa = [System.Uri]::UnescapeDataString($peticion.Url.AbsolutePath).TrimStart('/')
    if ([string]::IsNullOrWhiteSpace($relativa)) { $relativa = 'index.html' }
    $relativa = $relativa -replace '/', '\'

    $destino = Join-Path $raiz $relativa
    $completa = [System.IO.Path]::GetFullPath($destino)
    $raizCompleta = [System.IO.Path]::GetFullPath($raiz)

    # Nunca servir nada fuera de esta carpeta.
    if (-not $completa.StartsWith($raizCompleta, [System.StringComparison]::OrdinalIgnoreCase)) {
      $respuesta.StatusCode = 403
      $respuesta.Close()
      continue
    }

    if (Test-Path $completa -PathType Container) {
      $completa = Join-Path $completa 'index.html'
    }

    if (Test-Path $completa -PathType Leaf) {
      $extension = [System.IO.Path]::GetExtension($completa).ToLower()
      if ($tipos.ContainsKey($extension)) {
        $respuesta.ContentType = $tipos[$extension]
      } else {
        $respuesta.ContentType = 'application/octet-stream'
      }
      $bytes = [System.IO.File]::ReadAllBytes($completa)
      $respuesta.ContentLength64 = $bytes.Length
      $respuesta.AddHeader('Cache-Control', 'no-cache')
      $respuesta.OutputStream.Write($bytes, 0, $bytes.Length)
      Write-Host ("  200  " + $relativa) -ForegroundColor DarkGray
    } else {
      $respuesta.StatusCode = 404
      $mensaje = [System.Text.Encoding]::UTF8.GetBytes('No encontrado: ' + $relativa)
      $respuesta.ContentType = 'text/plain; charset=utf-8'
      $respuesta.ContentLength64 = $mensaje.Length
      $respuesta.OutputStream.Write($mensaje, 0, $mensaje.Length)
      Write-Host ("  404  " + $relativa) -ForegroundColor DarkYellow
    }
  } catch {
    try { $respuesta.StatusCode = 500 } catch {}
  } finally {
    try { $respuesta.Close() } catch {}
  }
}

$escucha.Stop()
$escucha.Close()
