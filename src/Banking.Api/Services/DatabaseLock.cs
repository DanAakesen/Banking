using Banking.Api.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;

namespace Banking.Api.Services;

public static class DatabaseLock
{
    public static async Task AcquireTransaction(BankingDb db, string resource, CancellationToken ct)
    {
        await using var command = db.Database.GetDbConnection().CreateCommand();
        command.Transaction = db.Database.CurrentTransaction!.GetDbTransaction();
        command.CommandText = "DECLARE @result int; EXEC @result=sp_getapplock @Resource=@resource, @LockMode='Exclusive', @LockOwner='Transaction', @LockTimeout=5000; SELECT @result;";
        var parameter = command.CreateParameter(); parameter.ParameterName = "@resource"; parameter.Value = resource; command.Parameters.Add(parameter);
        if (Convert.ToInt32(await command.ExecuteScalarAsync(ct)) < 0) throw new ApiFailure(409, "OPERATION_IN_PROGRESS");
    }
}
