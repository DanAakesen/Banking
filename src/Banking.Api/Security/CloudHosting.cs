using System.Security.Cryptography.X509Certificates;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.Data.SqlClient;

namespace Banking.Api.Security;

public static class CloudHosting
{
    public static bool Enabled(IHostEnvironment environment) => environment.IsProduction();

    public static string Origin(IConfiguration config)
    {
        var value = config["Cloud:Origin"];
        if (!Uri.TryCreate(value, UriKind.Absolute, out var uri) || uri.Scheme != "https"
            || uri.AbsolutePath != "/" || uri.Query.Length != 0 || uri.UserInfo.Length != 0)
            throw new InvalidOperationException("A production HTTPS origin is required.");
        return uri.GetLeftPart(UriPartial.Authority);
    }

    public static string ValidateConnection(string value, string mode)
    {
        var connection = new SqlConnectionStringBuilder(value);
        if (!connection.DataSource.EndsWith(".database.windows.net", StringComparison.OrdinalIgnoreCase)
            || connection.InitialCatalog != (mode == "Live" ? "Banking_Live_Dan" : "Banking_Demo")
            || connection.Authentication != SqlAuthenticationMethod.ActiveDirectoryManagedIdentity
            || connection.TrustServerCertificate || connection.Encrypt != SqlConnectionEncryptOption.Mandatory
            || connection.IntegratedSecurity || connection.UserID.Length != 0 || connection.Password.Length != 0
            || connection.AttachDBFilename.Length != 0)
            throw new InvalidOperationException("Production requires isolated Azure SQL databases and Managed Identity with TLS.");
        return connection.ConnectionString;
    }

    public static void ConfigureProtection(IServiceCollection services, IConfiguration config)
    {
        _ = Origin(config);
        var certificate = X509CertificateLoader.LoadPkcs12(Convert.FromBase64String(
            config["Cloud:ProtectionCertificate"] ?? throw new InvalidOperationException("Protection certificate required.")),
            null, X509KeyStorageFlags.EphemeralKeySet);
        if (!certificate.HasPrivateKey) throw new InvalidOperationException("Protection private key required.");
        var directory = config["Cloud:KeyDirectory"] ?? "/home/Banking/keys";
        Directory.CreateDirectory(directory);
        services.AddDataProtection().SetApplicationName("Banking.Cloud.v1")
            .PersistKeysToFileSystem(new DirectoryInfo(directory)).ProtectKeysWithCertificate(certificate);
    }
}
