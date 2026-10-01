using System.Security.AccessControl;
using System.Security.Principal;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Runtime.Versioning;

namespace Banking.Api.Security;

[SupportedOSPlatform("windows")]
public static class LocalStorage
{
    public static string Root => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Banking");
    public static string PrivateKeyPath => Path.Combine(Root, "enable-banking-private.dpapi");
    public static string PublicKeyPath => Path.Combine(Root, "enable-banking-public.pem");
    public static string PublicCertificatePath => Path.Combine(Root, "enable-banking-public.crt");
    public static void ProtectDirectories()
    {
        foreach (var path in new[] { Root, Path.Combine(Root, "keys"), Path.Combine(Root, "data") })
        {
            var directory = Directory.CreateDirectory(path);
            var acl = new DirectorySecurity(); acl.SetAccessRuleProtection(isProtected: true, preserveInheritance: false);
            var owner = WindowsIdentity.GetCurrent().User!; acl.SetOwner(owner);
            foreach (var sid in new[] { owner, new SecurityIdentifier(WellKnownSidType.LocalSystemSid, null), new SecurityIdentifier(WellKnownSidType.BuiltinAdministratorsSid, null) })
                acl.AddAccessRule(new FileSystemAccessRule(sid, FileSystemRights.FullControl, InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit, PropagationFlags.None, AccessControlType.Allow));
            directory.SetAccessControl(acl);
        }
    }
    public static object PrepareKey(Vault vault)
    {
        ProtectDirectories();
        using var rsa = RSA.Create(3072);
        if (File.Exists(PrivateKeyPath)) rsa.ImportFromPem(vault.Reveal(File.ReadAllText(PrivateKeyPath)));
        else
        {
            using var stream = new FileStream(PrivateKeyPath, FileMode.CreateNew, FileAccess.Write, FileShare.None);
            using var writer = new StreamWriter(stream); writer.Write(vault.Protect(rsa.ExportPkcs8PrivateKeyPem()));
        }
        var publicKey = rsa.ExportSubjectPublicKeyInfoPem();
        if (File.Exists(PublicKeyPath) && File.ReadAllText(PublicKeyPath) != publicKey) throw new InvalidOperationException("Existing public key does not match; no files were replaced.");
        if (!File.Exists(PublicKeyPath)) File.WriteAllText(PublicKeyPath, publicKey);
        if (!File.Exists(PublicCertificatePath))
        {
            var request = new CertificateRequest("CN=Banking", rsa, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
            using var created = request.CreateSelfSigned(DateTimeOffset.UtcNow.AddMinutes(-5), DateTimeOffset.UtcNow.AddDays(365));
            using var stream = new FileStream(PublicCertificatePath, FileMode.CreateNew, FileAccess.Write, FileShare.None);
            using var writer = new StreamWriter(stream); writer.Write(created.ExportCertificatePem());
        }
        using var certificate = X509Certificate2.CreateFromPem(File.ReadAllText(PublicCertificatePath));
        using var certificateKey = certificate.GetRSAPublicKey();
        if (certificate.HasPrivateKey || certificateKey is null ||
            !certificateKey.ExportSubjectPublicKeyInfo().SequenceEqual(rsa.ExportSubjectPublicKeyInfo()))
            throw new InvalidOperationException("Existing public certificate does not match; no files were replaced.");
        if (certificate.NotAfter.ToUniversalTime() <= DateTime.UtcNow)
            throw new InvalidOperationException("Public certificate has expired; registration renewal is required.");
        return new { publicKeyFile = PublicKeyPath, publicCertificateFile = PublicCertificatePath,
            certificateExpiresAt = certificate.NotAfter.ToUniversalTime(),
            publicKeySha256 = Convert.ToHexString(SHA256.HashData(rsa.ExportSubjectPublicKeyInfo())), privateKeyProtected = true, registeredExternally = false };
    }
}
