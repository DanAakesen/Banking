using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Banking.Api.Migrations
{
    /// <inheritdoc />
    public partial class WealthSnapshots : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "WealthRecords",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Name = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    Provider = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    Kind = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    Value = table.Column<decimal>(type: "decimal(19,4)", precision: 19, scale: 4, nullable: false),
                    Currency = table.Column<string>(type: "nvarchar(3)", maxLength: 3, nullable: false),
                    AsOf = table.Column<DateOnly>(type: "date", nullable: false),
                    SourceNote = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    AnnualPension = table.Column<decimal>(type: "decimal(19,4)", precision: 19, scale: 4, nullable: true),
                    RetirementAge = table.Column<int>(type: "int", nullable: true),
                    DemoScope = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false, defaultValue: ""),
                    Version = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WealthRecords", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_WealthRecords_DemoScope_Kind_Provider_Name",
                table: "WealthRecords",
                columns: new[] { "DemoScope", "Kind", "Provider", "Name" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "WealthRecords");
        }
    }
}
