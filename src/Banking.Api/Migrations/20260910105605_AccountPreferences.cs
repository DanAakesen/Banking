using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Banking.Api.Migrations
{
    /// <inheritdoc />
    public partial class AccountPreferences : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "CustomName",
                table: "Accounts",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsSavings",
                table: "Accounts",
                type: "bit",
                nullable: false,
                defaultValue: false);

            // One-time classification of the existing fictional dataset only. User choices survive subsequent starts.
            migrationBuilder.Sql("UPDATE a SET IsSavings = 1 FROM Accounts a INNER JOIN Connections c ON c.Id = a.ConnectionId WHERE c.IsDemo = 1 AND c.Provider = 'product-demo' AND a.ProviderAccountId IN ('savings', 'car', 'summerhouse')");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "CustomName",
                table: "Accounts");

            migrationBuilder.DropColumn(
                name: "IsSavings",
                table: "Accounts");
        }
    }
}
