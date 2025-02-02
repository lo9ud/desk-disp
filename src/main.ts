import { invoke } from "@tauri-apps/api/core";
import moment from "moment";

let d_container: HTMLElement | null = null;
let t_container: HTMLElement | null = null;
let s_container: HTMLElement | null = null;

window.addEventListener("DOMContentLoaded", async () => {
  get_containers();
  do_repeat(set_data, 997);
});

async function do_repeat(f: () => void, interval: number) {
  f();
  setInterval(f, interval);
}

async function get_containers() {
  d_container = document.getElementById("date");
  if (!d_container) {
    console.error("Couldn't find date container");
  }

  t_container = document.getElementById("time");
  if (!t_container) {
    console.error("Couldn't find time container");
  }

  s_container = document.getElementById("song");
  if (!s_container) {
    console.error("Couldn't find song container");
  }
}

async function get_song() {
  return await invoke("get_song");
}

async function set_data() {
  let m = moment();
  if (d_container) {
    d_container.textContent = m.format("dddd, Do MMMM YYYY");
  }
  if (t_container) {
    t_container.textContent = m.format("h:mm A");
  }
  if (s_container) {
    s_container.textContent =
      ((await get_song()) as string | null) ?? "No song playing";
  }
}
