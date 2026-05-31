param(
    [Parameter(Mandatory)]
    [string]$MigrationName
)

$root = Resolve-Path (Join-Path $PSScriptRoot "../../..")

dotnet ef migrations add $MigrationName `
    --project "$root/API/Database/MigrationHandler" `
    --startup-project "$root/API/Backend"

if ($LASTEXITCODE -eq 0) {
    dotnet ef database update `
        --project "$root/API/Database/MigrationHandler" `
        --startup-project "$root/API/Backend"
}
