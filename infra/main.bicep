targetScope = 'resourceGroup'

param location string = 'westeurope'
param appName string = 'banking-dan-0ac7d719'
param sqlName string = 'banking-sql-0ac7d719'
param storageName string = 'bankingdata0ac7d719'
param tenantId string = '802efa29-17f2-4a79-8f5f-38f087aed96a'
param administratorId string = '12bcfab7-49ba-4cf7-8be7-780a13911f93'

resource plan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: 'banking-linux-b1'
  location: location
  kind: 'linux'
  sku: { name: 'B1', tier: 'Basic', capacity: 1 }
  properties: { reserved: true }
}
resource app 'Microsoft.Web/sites@2023-12-01' = {
  name: appName
  location: location
  kind: 'app,linux'
  identity: { type: 'SystemAssigned' }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    publicNetworkAccess: 'Enabled'
    siteConfig: {
      linuxFxVersion: 'DOTNETCORE|10.0'
      appCommandLine: 'dotnet Banking.Api.dll'
      alwaysOn: true
      http20Enabled: true
      minTlsVersion: '1.2'
      scmMinTlsVersion: '1.2'
      ftpsState: 'Disabled'
      httpLoggingEnabled: false
      detailedErrorLoggingEnabled: false
      requestTracingEnabled: false
      healthCheckPath: '/health'
    }
  }
}
resource ftp 'Microsoft.Web/sites/basicPublishingCredentialsPolicies@2023-12-01' = {
  parent: app
  name: 'ftp'
  properties: { allow: false }
}
resource scm 'Microsoft.Web/sites/basicPublishingCredentialsPolicies@2023-12-01' = {
  parent: app
  name: 'scm'
  properties: { allow: false }
}
resource sql 'Microsoft.Sql/servers@2023-08-01' = {
  name: sqlName
  location: location
  properties: {
    version: '12.0'
    minimalTlsVersion: '1.2'
    publicNetworkAccess: 'Enabled'
    administrators: {
      administratorType: 'ActiveDirectory'
      principalType: 'User'
      login: 'Dan@novaro.dk'
      sid: administratorId
      tenantId: tenantId
      azureADOnlyAuthentication: true
    }
  }
}
resource databases 'Microsoft.Sql/servers/databases@2023-08-01' = [for name in ['Banking_Demo', 'Banking_Live_Dan']: {
  parent: sql
  name: name
  location: location
  sku: { name: 'Basic', tier: 'Basic', capacity: 5 }
  properties: { maxSizeBytes: 2147483648, requestedBackupStorageRedundancy: 'Local' }
}]
resource backupRetention 'Microsoft.Sql/servers/databases/backupShortTermRetentionPolicies@2023-08-01' = [for (name, i) in ['Banking_Demo', 'Banking_Live_Dan']: {
  parent: databases[i]
  name: 'default'
  properties: { retentionDays: 7 }
}]
resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageName
  location: location
  kind: 'StorageV2'
  sku: { name: 'Standard_LRS' }
  properties: {
    supportsHttpsTrafficOnly: true
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
    allowSharedKeyAccess: false
    defaultToOAuthAuthentication: true
    allowCrossTenantReplication: false
    publicNetworkAccess: 'Enabled'
  }
}
resource blobs 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storage
  name: 'default'
  properties: { deleteRetentionPolicy: { enabled: true, days: 7 } }
}
resource recovery 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobs
  name: 'recovery'
  properties: { publicAccess: 'None' }
}
// Recovery uploads are performed by the operator. The runtime currently needs SQL only.
resource operatorRecoveryRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(recovery.id, administratorId, 'blob-contributor')
  scope: recovery
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'ba92f5b4-2d11-453d-a403-e96b0029c9fe')
    principalId: administratorId
    principalType: 'User'
  }
}
output url string = 'https://${app.properties.defaultHostName}'
output identity string = app.identity.principalId
output databaseServer string = sql.properties.fullyQualifiedDomainName
output storageAccount string = storage.name
