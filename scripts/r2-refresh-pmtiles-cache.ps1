Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$AccountId = "7e78742ed8b9cbafa04a82af80e05581"
$Bucket = "basemap"
$Key = "global.pmtiles/20260421.pmtiles"
$Endpoint = "https://$AccountId.r2.cloudflarestorage.com"

$CacheControl = "public, max-age=31536000, immutable"
$SingleCopyLimit = [int64](5GB - 5MB)
$PartSizeBytes = [int64]1GB
$CliReadTimeoutSeconds = 0
$CliConnectTimeoutSeconds = 300
$PartMaxRetries = 3
$StatusTickSeconds = 5

function Invoke-AwsCli {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$Arguments,

    [switch]$AsJson
  )

  $output = & aws @Arguments 2>&1
  $exitCode = $LASTEXITCODE
  $text = ($output | ForEach-Object { "$_" }) -join [Environment]::NewLine

  if ($exitCode -ne 0) {
    $message = if ([string]::IsNullOrWhiteSpace($text)) {
      "AWS CLI command failed with exit code $exitCode."
    } else {
      $text.Trim()
    }

    throw $message
  }

  if (-not $AsJson) {
    return $text
  }

  if ([string]::IsNullOrWhiteSpace($text)) {
    throw "AWS CLI returned empty JSON output."
  }

  return $text | ConvertFrom-Json
}

function Start-AwsProcess {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$Arguments
  )

  function ConvertTo-ProcessArgument {
    param(
      [Parameter(Mandatory = $true)]
      [string]$Argument
    )

    if ($Argument -notmatch '[\s"]') {
      return $Argument
    }

    $escaped = $Argument -replace '(\\*)"', '$1$1\"'
    $escaped = $escaped -replace '(\\+)$', '$1$1'
    return '"' + $escaped + '"'
  }

  $psi = [System.Diagnostics.ProcessStartInfo]::new()
  $psi.FileName = "aws"
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true
  $psi.Arguments = ($Arguments | ForEach-Object { ConvertTo-ProcessArgument -Argument $_ }) -join ' '

  $process = [System.Diagnostics.Process]::new()
  $process.StartInfo = $psi
  [void]$process.Start()
  return $process
}

function Wait-AwsProcessWithStatus {
  param(
    [Parameter(Mandatory = $true)]
    [System.Diagnostics.Process]$Process,

    [Parameter(Mandatory = $true)]
    [string]$StatusText
  )

  $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()

  while (-not $Process.WaitForExit($StatusTickSeconds * 1000)) {
    Write-Host ("  {0} | elapsed {1:n0}s" -f $StatusText, $stopwatch.Elapsed.TotalSeconds)
  }

  $stdout = $Process.StandardOutput.ReadToEnd()
  $stderr = $Process.StandardError.ReadToEnd()
  $stopwatch.Stop()

  if ($Process.ExitCode -ne 0) {
    $message = if ([string]::IsNullOrWhiteSpace($stderr)) {
      if ([string]::IsNullOrWhiteSpace($stdout)) {
        "AWS CLI command failed with exit code $($Process.ExitCode)."
      } else {
        $stdout.Trim()
      }
    } else {
      $stderr.Trim()
    }

    throw $message
  }

  if ([string]::IsNullOrWhiteSpace($stdout)) {
    throw "AWS CLI returned empty JSON output."
  }

  return $stdout | ConvertFrom-Json
}

function Format-Bytes {
  param(
    [Parameter(Mandatory = $true)]
    [int64]$Bytes
  )

  $units = @("B", "KB", "MB", "GB", "TB")
  $value = [double]$Bytes
  $unitIndex = 0

  while ($value -ge 1024 -and $unitIndex -lt ($units.Length - 1)) {
    $value /= 1024
    $unitIndex++
  }

  return "{0:n2} {1}" -f $value, $units[$unitIndex]
}

function Get-PartEnd {
  param(
    [Parameter(Mandatory = $true)]
    [int64]$Start,

    [Parameter(Mandatory = $true)]
    [int64]$PartSize,

    [Parameter(Mandatory = $true)]
    [int64]$TotalSize
  )

  $endCandidate = [int64]($Start + $PartSize - 1)
  $lastByte = [int64]($TotalSize - 1)
  if ($endCandidate -lt $lastByte) {
    return $endCandidate
  }

  return $lastByte
}

Write-Host "Reading object metadata..."
$head = Invoke-AwsCli -Arguments @(
  "s3api", "head-object",
  "--bucket", $Bucket,
  "--key", $Key,
  "--endpoint-url", $Endpoint,
  "--region", "auto",
  "--output", "json",
  "--no-cli-pager"
) -AsJson

$size = [int64]$head.ContentLength
$contentType = if ([string]::IsNullOrWhiteSpace($head.ContentType)) {
  "application/octet-stream"
} else {
  $head.ContentType
}

Write-Host "Object size: $size bytes ($(Format-Bytes -Bytes $size))"
Write-Host "Content-Type: $contentType"

if ($size -le $SingleCopyLimit) {
  Write-Host "Using single copy-object..."

  [void](Invoke-AwsCli -Arguments @(
    "s3api", "copy-object",
    "--bucket", $Bucket,
    "--key", $Key,
    "--copy-source", "$Bucket/$Key",
    "--metadata-directive", "REPLACE",
    "--content-type", $contentType,
    "--cache-control", $CacheControl,
    "--endpoint-url", $Endpoint,
    "--region", "auto",
    "--output", "json",
    "--no-cli-pager",
    "--cli-read-timeout", "$CliReadTimeoutSeconds",
    "--cli-connect-timeout", "$CliConnectTimeoutSeconds"
  ) -AsJson)

  Write-Host "Single copy completed."
  return
}

Write-Host "Using multipart server-side copy..."
$totalParts = [int][Math]::Ceiling($size / [double]$PartSizeBytes)
$create = Invoke-AwsCli -Arguments @(
  "s3api", "create-multipart-upload",
  "--bucket", $Bucket,
  "--key", $Key,
  "--content-type", $contentType,
  "--cache-control", $CacheControl,
  "--endpoint-url", $Endpoint,
  "--region", "auto",
  "--output", "json",
  "--no-cli-pager"
) -AsJson

$uploadId = $create.UploadId
Write-Host "UploadId: $uploadId"
Write-Host "Part size: $(Format-Bytes -Bytes $PartSizeBytes) | Parts: $totalParts"

$parts = New-Object System.Collections.Generic.List[object]
$start = [int64]0
$partNumber = 1
$completedBytes = [int64]0

try {
  while ($start -lt $size) {
    $end = Get-PartEnd -Start $start -PartSize $PartSizeBytes -TotalSize $size
    $partBytes = [int64]($end - $start + 1)
    $partLabel = "part $partNumber/$totalParts"
    $copied = $false

    for ($attempt = 1; $attempt -le $PartMaxRetries; $attempt++) {
      Write-Host ("Starting {0} | range {1}-{2} | size {3} | attempt {4}/{5}" -f $partLabel, $start, $end, (Format-Bytes -Bytes $partBytes), $attempt, $PartMaxRetries)

      try {
        $process = Start-AwsProcess -Arguments @(
          "s3api", "upload-part-copy",
          "--bucket", $Bucket,
          "--key", $Key,
          "--part-number", "$partNumber",
          "--upload-id", "$uploadId",
          "--copy-source", "$Bucket/$Key",
          "--copy-source-range", "bytes=$start-$end",
          "--endpoint-url", $Endpoint,
          "--region", "auto",
          "--output", "json",
          "--no-cli-pager",
          "--cli-read-timeout", "$CliReadTimeoutSeconds",
          "--cli-connect-timeout", "$CliConnectTimeoutSeconds"
        )

        $resp = Wait-AwsProcessWithStatus -Process $process -StatusText "$partLabel running"

        $parts.Add([pscustomobject]@{
          ETag = $resp.CopyPartResult.ETag.Trim('"')
          PartNumber = $partNumber
        })

        $completedBytes += $partBytes
        $overallPercent = [Math]::Round(($completedBytes / [double]$size) * 100, 2)
        Write-Host ("Finished {0} | overall {1}/{2} ({3}%)" -f $partLabel, (Format-Bytes -Bytes $completedBytes), (Format-Bytes -Bytes $size), $overallPercent)

        $copied = $true
        break
      } catch {
        Write-Warning ("{0} failed on attempt {1}/{2}: {3}" -f $partLabel, $attempt, $PartMaxRetries, $_.Exception.Message)
        if ($attempt -eq $PartMaxRetries) {
          throw
        }
      }
    }

    if (-not $copied) {
      throw "Failed to copy $partLabel."
    }

    $start = [int64]($end + 1)
    $partNumber++
  }

  $completeJsonPath = Join-Path $env:TEMP "r2-complete-multipart-upload.json"
  @{ Parts = @($parts) } | ConvertTo-Json -Depth 4 | Set-Content -Path $completeJsonPath -Encoding utf8

  Write-Host "Completing multipart upload..."
  [void](Invoke-AwsCli -Arguments @(
    "s3api", "complete-multipart-upload",
    "--bucket", $Bucket,
    "--key", $Key,
    "--upload-id", "$uploadId",
    "--multipart-upload", "file://$completeJsonPath",
    "--endpoint-url", $Endpoint,
    "--region", "auto",
    "--output", "json",
    "--no-cli-pager",
    "--cli-read-timeout", "$CliReadTimeoutSeconds",
    "--cli-connect-timeout", "$CliConnectTimeoutSeconds"
  ) -AsJson)

  Write-Host "Multipart copy completed."
} catch {
  Write-Warning "Failed, aborting multipart upload..."
  if ($uploadId) {
    & aws s3api abort-multipart-upload `
      --bucket $Bucket `
      --key $Key `
      --upload-id $uploadId `
      --endpoint-url $Endpoint `
      --region auto `
      --no-cli-pager | Out-Null
  }
  throw
}
