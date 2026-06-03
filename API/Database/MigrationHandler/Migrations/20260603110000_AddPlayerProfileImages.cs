using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MigrationHandler.Migrations
{
    public partial class AddPlayerProfileImages : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<byte[]>(
                name: "ProfileImage",
                table: "USR_Players",
                type: "varbinary(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ProfileImageContentType",
                table: "USR_Players",
                type: "nvarchar(80)",
                maxLength: 80,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "ProfileImageUpdatedAt",
                table: "USR_Players",
                type: "datetime2",
                nullable: true);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ProfileImage",
                table: "USR_Players");

            migrationBuilder.DropColumn(
                name: "ProfileImageContentType",
                table: "USR_Players");

            migrationBuilder.DropColumn(
                name: "ProfileImageUpdatedAt",
                table: "USR_Players");
        }
    }
}
