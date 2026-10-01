using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Banking.Api.Services;

namespace Banking.Api.Security;

public static class PortableArchive
{
    private const int Iterations = 600000;
    private static readonly byte[] AssociatedData = Encoding.UTF8.GetBytes("Banking.PortableArchive.v1");
    private sealed record Envelope(int Format, byte[] Salt, byte[] Nonce, byte[] Tag, byte[] Ciphertext);
    public static string Encrypt(string plaintext, string passphrase)
    {
        Check.That(passphrase.Length is >= 16 and <= 1024, "BACKUP_PASSPHRASE_TOO_SHORT_OR_LONG");
        var salt = RandomNumberGenerator.GetBytes(16); var nonce = RandomNumberGenerator.GetBytes(12); var tag = new byte[16];
        var key = Rfc2898DeriveBytes.Pbkdf2(passphrase, salt, Iterations, HashAlgorithmName.SHA256, 32);
        var bytes = Encoding.UTF8.GetBytes(plaintext); var ciphertext = new byte[bytes.Length];
        try
        {
            using var aes = new AesGcm(key, 16); aes.Encrypt(nonce, bytes, ciphertext, tag, AssociatedData);
            return JsonSerializer.Serialize(new Envelope(1, salt, nonce, tag, ciphertext));
        }
        finally { CryptographicOperations.ZeroMemory(key); CryptographicOperations.ZeroMemory(bytes); }
    }
    public static string Decrypt(string archive, string passphrase)
    {
        Check.That(passphrase.Length is >= 16 and <= 1024, "BACKUP_PASSPHRASE_TOO_SHORT_OR_LONG");
        var envelope = JsonSerializer.Deserialize<Envelope>(archive) ?? throw new ApiFailure(400, "INVALID_ARCHIVE");
        Check.That(envelope.Format == 1 && envelope.Salt is { Length: 16 } && envelope.Nonce is { Length: 12 }
            && envelope.Tag is { Length: 16 } && envelope.Ciphertext is { Length: > 0 and <= 192 * 1024 * 1024 }, "INVALID_ARCHIVE");
        var key = Rfc2898DeriveBytes.Pbkdf2(passphrase, envelope.Salt!, Iterations, HashAlgorithmName.SHA256, 32);
        var plaintext = new byte[envelope.Ciphertext!.Length];
        try
        {
            using var aes = new AesGcm(key, 16); aes.Decrypt(envelope.Nonce!, envelope.Ciphertext, envelope.Tag!, plaintext, AssociatedData);
            return Encoding.UTF8.GetString(plaintext);
        }
        catch (CryptographicException) { throw new ApiFailure(400, "ARCHIVE_AUTHENTICATION_FAILED"); }
        finally { CryptographicOperations.ZeroMemory(key); CryptographicOperations.ZeroMemory(plaintext); }
    }
    public static string ReadPassphrase(bool confirm)
    {
        if (Console.IsInputRedirected) throw new InvalidOperationException("Enter the backup passphrase in an interactive terminal; never pass it in arguments or environment variables.");
        static string Read(string prompt)
        {
            Console.Write(prompt); var result = new StringBuilder();
            while (true)
            {
                var key = Console.ReadKey(intercept: true);
                if (key.Key == ConsoleKey.Enter) { Console.WriteLine(); return result.ToString(); }
                if (key.Key == ConsoleKey.Backspace) { if (result.Length > 0) result.Length--; }
                else if (!char.IsControl(key.KeyChar) && result.Length < 1024) result.Append(key.KeyChar);
            }
        }
        var password = Read("Backup passphrase (at least 16 characters, hidden): ");
        if (confirm && password != Read("Confirm passphrase: ")) throw new InvalidOperationException("Passphrases do not match.");
        return password;
    }
}
