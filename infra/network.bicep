param sqlName string = 'banking-sql-0ac7d719'
param appOutboundIps array
param operatorIp string = ''
resource server 'Microsoft.Sql/servers@2023-08-01' existing = { name: sqlName }
resource appRules 'Microsoft.Sql/servers/firewallRules@2023-08-01' = [for (ip, index) in appOutboundIps: {
  parent: server
  name: 'AppService-${index}'
  properties: { startIpAddress: ip, endIpAddress: ip }
}]
resource operator 'Microsoft.Sql/servers/firewallRules@2023-08-01' = if (!empty(operatorIp)) {
  parent: server
  name: 'TemporaryMigrationOperator'
  properties: { startIpAddress: operatorIp, endIpAddress: operatorIp }
}
resource connectionPolicy 'Microsoft.Sql/servers/connectionPolicies@2023-08-01' = {
  parent: server
  name: 'default'
  properties: { connectionType: 'Proxy' }
}
