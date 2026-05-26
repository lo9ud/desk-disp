// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use clap::Parser;

fn main() {
    let args = desk_disp_lib::cli::Args::parse();
    desk_disp_lib::run(args);
}
