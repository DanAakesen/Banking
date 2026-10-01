using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Banking.Api.Migrations
{
    /// <inheritdoc />
    public partial class ReviewInbox : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ReviewActions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Kind = table.Column<string>(type: "nvarchar(24)", maxLength: 24, nullable: false),
                    ItemKey = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    Signature = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    Payload = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    SnoozeUntil = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    UndoneAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    Version = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ReviewActions", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ReviewActions_CreatedAt",
                table: "ReviewActions",
                column: "CreatedAt");

            migrationBuilder.CreateIndex(
                name: "IX_ReviewActions_ItemKey_Signature",
                table: "ReviewActions",
                columns: new[] { "ItemKey", "Signature" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ReviewActions");
        }
    }
}
