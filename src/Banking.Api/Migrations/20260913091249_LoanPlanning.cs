using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Banking.Api.Migrations
{
    /// <inheritdoc />
    public partial class LoanPlanning : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Loans",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Name = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    Principal = table.Column<decimal>(type: "decimal(19,4)", precision: 19, scale: 4, nullable: false),
                    AnnualRate = table.Column<decimal>(type: "decimal(19,4)", precision: 19, scale: 4, nullable: false),
                    Months = table.Column<int>(type: "int", nullable: false),
                    BalanceDate = table.Column<DateOnly>(type: "date", nullable: false),
                    Currency = table.Column<string>(type: "nvarchar(3)", maxLength: 3, nullable: false),
                    MonthlyFee = table.Column<decimal>(type: "decimal(19,4)", precision: 19, scale: 4, nullable: false),
                    UpfrontFee = table.Column<decimal>(type: "decimal(19,4)", precision: 19, scale: 4, nullable: false),
                    IsScenario = table.Column<bool>(type: "bit", nullable: false),
                    DemoScope = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false, defaultValue: ""),
                    Version = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Loans", x => x.Id);
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Loans");
        }
    }
}
