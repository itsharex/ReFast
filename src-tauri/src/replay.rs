use crate::recording::RecordedEvent;
use serde_json;
use std::fs;
use std::path::Path;

pub struct ReplayState {
    pub is_playing: bool,
    pub current_events: Vec<RecordedEvent>,
    pub current_index: usize,
    pub speed_multiplier: f32,
}

impl ReplayState {
    pub fn new() -> Self {
        Self {
            is_playing: false,
            current_events: Vec::new(),
            current_index: 0,
            speed_multiplier: 1.0,
        }
    }

    pub fn load_recording<P: AsRef<Path>>(&mut self, path: P) -> Result<(), String> {
        let content = fs::read_to_string(path).map_err(|e| format!("Failed to read file: {}", e))?;
        
        // Parse JSON - the file contains {events: [...], duration_ms: ..., created_at: ...}
        let json: serde_json::Value = serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse JSON: {}", e))?;
        
        // Extract events array
        self.current_events = json["events"]
            .as_array()
            .ok_or_else(|| "Missing or invalid 'events' field in recording file".to_string())?
            .iter()
            .map(|v| serde_json::from_value(v.clone()))
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("Failed to parse events: {}", e))?;
        
        self.current_index = 0;
        Ok(())
    }

    pub fn start(&mut self, speed: f32) {
        self.is_playing = true;
        self.current_index = 0;
        self.speed_multiplier = speed;
    }

    pub fn stop(&mut self) {
        self.is_playing = false;
        self.current_index = 0;
    }

    pub fn get_progress(&self) -> f32 {
        if self.current_events.is_empty() {
            return 0.0;
        }
        (self.current_index as f32 / self.current_events.len() as f32) * 100.0
    }
}

impl Default for ReplayState {
    fn default() -> Self {
        Self::new()
    }
}

