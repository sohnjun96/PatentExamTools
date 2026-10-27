param(
  [string]$SourcePath = "..\전문XML 파일\1020200093844.xml",
  [string]$OutputPath = "app\data\demo-fulltext.json"
)

$ErrorActionPreference = "Stop"
[System.Text.Encoding]::RegisterProvider([System.Text.CodePagesEncodingProvider]::Instance)

$resolvedSource = Resolve-Path -LiteralPath $SourcePath
$bytes = [System.IO.File]::ReadAllBytes($resolvedSource)
$xmlText = [System.Text.Encoding]::GetEncoding(51949).GetString($bytes)
$document = [xml]$xmlText
$script:BreakMarker = [char]0xE000

function Get-RawNodeText([System.Xml.XmlNode]$Node) {
  $builder = [System.Text.StringBuilder]::new()

  foreach ($child in $Node.ChildNodes) {
    if ($child.LocalName -eq "br") {
      [void]$builder.Append($script:BreakMarker)
    }
    elseif (
      $child.NodeType -eq [System.Xml.XmlNodeType]::Text -or
      $child.NodeType -eq [System.Xml.XmlNodeType]::CDATA
    ) {
      [void]$builder.Append($child.Value)
    }
    else {
      [void]$builder.Append((Get-RawNodeText $child))
    }
  }

  return $builder.ToString()
}

function Get-NodeText([System.Xml.XmlNode]$Node) {
  $value = (Get-RawNodeText $Node) -replace "`r`n?", "`n"
  $value = $value -replace '[ \t]*\n[ \t]*', ' '
  $value = $value -replace '[ \t]{2,}', ' '
  $value = $value.Replace([string]$script:BreakMarker, "`n")
  $value = $value -replace '[ \t]+\n', "`n"
  $value = $value -replace '\n[ \t]+', "`n"
  $value = $value -replace '\n{3,}', "`n`n"
  return $value.Trim()
}

function Get-Paragraphs([string]$Name) {
  $node = $document.SelectSingleNode("//*[local-name()='$Name']")
  if ($null -eq $node) { return @() }

  $paragraphNodes = @($node.SelectNodes(".//*[local-name()='p']"))
  if ($paragraphNodes.Count -eq 0) {
    return @(
      [ordered]@{
        number = $null
        text = Get-NodeText $node
      }
    )
  }

  return @(
    $paragraphNodes |
      ForEach-Object {
        $text = Get-NodeText $_
        if ($text) {
          [ordered]@{
            number = if ($_.HasAttribute("num")) { [string]$_.GetAttribute("num") } else { $null }
            text = $text
          }
        }
      }
  )
}

$sectionSpecs = @(
  @("technical-field", "기술분야"),
  @("background-art", "배경기술"),
  @("summary-of-invention", "발명의 내용"),
  @("description-of-drawings", "도면의 간단한 설명"),
  @("description-of-embodiments", "발명을 실시하기 위한 구체적인 내용"),
  @("reference-signs-list", "부호의 설명")
)

$sections = @(
  foreach ($spec in $sectionSpecs) {
    [ordered]@{
      id = $spec[0]
      title = $spec[1]
      paragraphs = @(Get-Paragraphs $spec[0])
    }
  }
)

$claims = @(
  $document.SelectNodes("//*[local-name()='claim']") |
    ForEach-Object {
      $claimText = (Get-NodeText $_) -replace '(?<=;)(?=\S)', ' ' -replace '(?<=,)(?=\S)', ' '
      [ordered]@{
        number = [int]$_.num
        text = $claimText
      }
    }
)

$payload = [ordered]@{
  applicationNumber = "1020200093844"
  title = Get-NodeText $document.SelectSingleNode("//*[local-name()='description']/*[local-name()='invention-title']")
  abstract = @((Get-Paragraphs "abstract"))
  sections = $sections
  claims = $claims
  figureCount = $document.SelectNodes("//*[local-name()='drawings']//*[local-name()='figure']").Count
  sourceFileName = "1020200093844.xml"
  isDemo = $true
  fetchedAt = $null
}

$outputDirectory = Split-Path -Parent $OutputPath
if (-not (Test-Path -LiteralPath $outputDirectory)) {
  New-Item -ItemType Directory -Path $outputDirectory | Out-Null
}

$json = $payload | ConvertTo-Json -Depth 8
[System.IO.File]::WriteAllText(
  (Join-Path (Get-Location) $OutputPath),
  $json + [Environment]::NewLine,
  [System.Text.UTF8Encoding]::new($false)
)

Write-Host "Created sanitized demo full-text fixture: $OutputPath"
