# ============================================================
#  Registro de Horas - servidor local
#
#  Chrome solo ofrece "Instalar" si la app viene de una direccion web.
#  Abriendo index.html a mano la direccion es file:// y no la ofrece nunca,
#  asi que este script sirve esta carpeta en http://localhost:8123/, que para
#  el navegador cuenta como direccion segura, y abre la app ahi.
#
#  Se arranca con Horas.cmd (o con el acceso directo del escritorio). Se apaga
#  solo a la media hora sin pedidos, para no quedar dando vueltas.
#
#  Nada sale de la computadora: escucha unicamente en localhost.
# ============================================================

$puerto    = 8123
$direccion = "http://localhost:$puerto/"
$raiz      = [System.IO.Path]::GetFullPath($PSScriptRoot).TrimEnd('\') + '\'
$espera    = 30 * 60 * 1000        # media hora sin pedidos y se apaga

$tipos = @{
  '.html'        = 'text/html; charset=utf-8'
  '.js'          = 'text/javascript; charset=utf-8'
  '.css'         = 'text/css; charset=utf-8'
  '.json'        = 'application/json; charset=utf-8'
  '.webmanifest' = 'application/manifest+json'
  '.png'         = 'image/png'
  '.svg'         = 'image/svg+xml'
  '.ico'         = 'image/x-icon'
  '.md'          = 'text/plain; charset=utf-8'
}

# Chrome si esta instalado; si no, el navegador que use la maquina.
function AbrirNavegador($url) {
  $rutas = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LocalAppData\Google\Chrome\Application\chrome.exe"
  )
  $chrome = $rutas | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
  if ($chrome) { Start-Process -FilePath $chrome -ArgumentList $url }
  else         { Start-Process $url }
}

$oyente = New-Object System.Net.HttpListener
$oyente.Prefixes.Add($direccion)

try {
  $oyente.Start()
} catch {
  # Casi siempre es que ya hay uno de estos andando: alcanza con abrir la app.
  AbrirNavegador $direccion
  exit 0
}

# El pedido del navegador espera en la cola hasta que empiece el ciclo de abajo.
AbrirNavegador $direccion

try {
  while ($oyente.IsListening) {
    $tarea = $oyente.GetContextAsync()
    if (-not $tarea.Wait($espera)) { break }
    $ctx = $tarea.Result

    try {
      $pedido = [System.Uri]::UnescapeDataString($ctx.Request.Url.LocalPath).TrimStart('/')
      if ([string]::IsNullOrWhiteSpace($pedido)) { $pedido = 'index.html' }

      # Solo se entregan archivos de esta carpeta, nunca de mas arriba.
      $archivo = [System.IO.Path]::GetFullPath((Join-Path $raiz $pedido))
      $dentro  = $archivo.StartsWith($raiz, [System.StringComparison]::OrdinalIgnoreCase)

      if ($dentro -and (Test-Path -LiteralPath $archivo -PathType Leaf)) {
        $ext = [System.IO.Path]::GetExtension($archivo).ToLower()
        $ctx.Response.ContentType = if ($tipos.ContainsKey($ext)) { $tipos[$ext] } else { 'application/octet-stream' }
        # Sin esto el navegador podria quedarse con una version vieja de app.js.
        $ctx.Response.Headers.Add('Cache-Control', 'no-cache')
        $bytes = [System.IO.File]::ReadAllBytes($archivo)
        $ctx.Response.ContentLength64 = $bytes.Length
        $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
      } else {
        $ctx.Response.StatusCode = 404
      }
    } catch {
      # El navegador corta conexiones a cada rato: recargas, pedidos que cancela
      # a mitad de camino. Que falle uno no puede tumbar el servidor entero.
    } finally {
      try { $ctx.Response.Close() } catch { }
    }
  }
} catch {
  # Si el oyente se cae, se sale ordenado: Horas.cmd lo vuelve a levantar.
} finally {
  $oyente.Stop()
  $oyente.Close()
}
