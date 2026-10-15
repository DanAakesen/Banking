using System.Security.Cryptography;
using Banking.Api.Services;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.Extensions.DependencyInjection;

namespace Banking.Tests;

public sealed class PensionOperatorSchemaTests
{
    const string Approved = PensionSchemaGate.Migration;

    sealed class Fixture : IDisposable
    {
        public readonly string TokenFile = Path.GetTempFileName();
        public readonly EphemeralDataProtectionProvider Protection = new();
        public readonly ServiceProvider Services;
        public readonly List<string> Calls = [];
        public string[] Demo = [];
        public string[] Live = [];
        public string? FailRead;
        public string? FailApply;

        public Fixture()
        {
            Services = new ServiceCollection().AddSingleton<IDataProtectionProvider>(Protection).BuildServiceProvider();
            File.WriteAllText(TokenFile, Protection.CreateProtector("Banking.Cloud.Migration.v1").Protect("synthetic-operator-token"));
        }

        public Task Run() => CloudImport.Schema(Services, TokenFile,
            (token, mode) => {
                Assert.Equal("synthetic-operator-token", token);
                Calls.Add("inspect:" + mode);
                if (mode == FailRead) throw new InvalidOperationException("Synthetic metadata failure.");
                return Task.FromResult(mode == "Demo" ? Demo : Live);
            },
            (token, mode) => {
                Assert.Equal("synthetic-operator-token", token);
                Calls.Add("apply:" + mode);
                if (mode == FailApply) throw new InvalidOperationException("Synthetic apply failure.");
                return Task.CompletedTask;
            });

        public void Dispose()
        {
            Services.Dispose();
            File.Delete(TokenFile);
        }
    }

    [Fact]
    public async Task AlreadyAppliedInspectsBothAndPerformsNoDdl()
    {
        using var fixture = new Fixture();
        await fixture.Run();
        Assert.Equal(["inspect:Demo", "inspect:Live"], fixture.Calls);
        Assert.False(File.Exists(fixture.TokenFile));
    }

    [Fact]
    public async Task ExpectedOnlyIsAppliedAfterBothPreflights()
    {
        using var fixture = new Fixture { Demo = [Approved], Live = [Approved] };
        await fixture.Run();
        Assert.Equal(["inspect:Demo", "inspect:Live", "apply:Demo", "apply:Live"], fixture.Calls);
        Assert.False(File.Exists(fixture.TokenFile));
    }

    [Theory]
    [InlineData("Demo")]
    [InlineData("Live")]
    public async Task AlreadyAppliedWorkspaceIsSkipped(string pendingMode)
    {
        using var fixture = new Fixture();
        if (pendingMode == "Demo") fixture.Demo = [Approved]; else fixture.Live = [Approved];
        await fixture.Run();
        Assert.Equal(["inspect:Demo", "inspect:Live", "apply:" + pendingMode], fixture.Calls);
        Assert.False(File.Exists(fixture.TokenFile));
    }

    [Theory]
    [InlineData("Demo")]
    [InlineData("Live")]
    public async Task UnexpectedOrMultiplePendingInEitherWorkspaceBlocksBothBeforeDdl(string unexpectedMode)
    {
        foreach (var pending in new[] { new[] { "20261016000000_Unapproved" },
                     new[] { Approved, "20261016000000_Unapproved" }, new[] { Approved, Approved } })
        {
            using var fixture = new Fixture { Demo = [Approved], Live = [Approved] };
            if (unexpectedMode == "Demo") fixture.Demo = pending; else fixture.Live = pending;
            var error = await Assert.ThrowsAsync<InvalidOperationException>(fixture.Run);
            Assert.Equal(["inspect:Demo", "inspect:Live"], fixture.Calls);
            Assert.DoesNotContain("20261016000000_Unapproved", error.Message);
            Assert.False(File.Exists(fixture.TokenFile));
        }
    }

    [Fact]
    public async Task DecryptionFailureDeletesHandoffAndNeverInspectsOrApplies()
    {
        using var fixture = new Fixture();
        File.WriteAllText(fixture.TokenFile, fixture.Protection.CreateProtector("wrong-purpose").Protect("synthetic-token"));
        await Assert.ThrowsAsync<CryptographicException>(fixture.Run);
        Assert.Empty(fixture.Calls);
        Assert.False(File.Exists(fixture.TokenFile));
    }

    [Fact]
    public async Task MissingTokenFailsBeforeAnyInspectionOrApply()
    {
        using var fixture = new Fixture();
        File.Delete(fixture.TokenFile);
        await Assert.ThrowsAsync<FileNotFoundException>(fixture.Run);
        Assert.Empty(fixture.Calls);
        Assert.False(File.Exists(fixture.TokenFile));
    }

    [Fact]
    public async Task MetadataFailureInLiveBlocksDemoApplyAndDeletesHandoff()
    {
        using var fixture = new Fixture { Demo = [Approved], FailRead = "Live" };
        await Assert.ThrowsAsync<InvalidOperationException>(fixture.Run);
        Assert.Equal(["inspect:Demo", "inspect:Live"], fixture.Calls);
        Assert.False(File.Exists(fixture.TokenFile));
    }

    [Fact]
    public async Task ApplyFailureDeletesHandoffAndStopsRemainingApply()
    {
        using var fixture = new Fixture { Demo = [Approved], Live = [Approved], FailApply = "Demo" };
        await Assert.ThrowsAsync<InvalidOperationException>(fixture.Run);
        Assert.Equal(["inspect:Demo", "inspect:Live", "apply:Demo"], fixture.Calls);
        Assert.False(File.Exists(fixture.TokenFile));
    }
}
