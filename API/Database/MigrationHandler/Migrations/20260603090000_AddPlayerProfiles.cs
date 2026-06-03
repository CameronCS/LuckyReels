using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MigrationHandler.Migrations
{
    public partial class AddPlayerProfiles : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Permission",
                table: "USR_Players",
                type: "nvarchar(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "Player");

            migrationBuilder.AddColumn<string>(
                name: "ProfileAvatar",
                table: "USR_Players",
                type: "nvarchar(max)",
                nullable: true);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Permission",
                table: "USR_Players");

            migrationBuilder.DropColumn(
                name: "ProfileAvatar",
                table: "USR_Players");
        }
    }
}
