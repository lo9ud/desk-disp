import { DateTime } from "luxon";

export type Metadata = {
  title: string;
  artist: string;
  album: string;
  album_art: string | null;
};

export type Core = {
  name: string;
  frequency: number;
  usage: number;
};

export type Processor = {
  brand: string;
  cores: Core[];
};

export type Processors = {
  processors: Processor[];
  total_physical_cores: number;
  total_logical_cores: number;
};

export type GpuDetails = {
  name: string;
  vendor: string;
  memory: number;
};

export type DiskDetails = {
  name: string;
  mount_point: string;
  file_system: string;
  kind: string;
  total_space: number;
  available_space: number;
};

export type Temperature = {
  id: string;
  label: string;
  current: number;
  max: number;
};

export type Weather = {
  timezone: string;
  current: {
    time: DateTime;
    temperature: number;
    weather_code: number;
  };
  daily: { at: DateTime; type: string }[];
  hourly: { at: DateTime; temp: number }[];
};
