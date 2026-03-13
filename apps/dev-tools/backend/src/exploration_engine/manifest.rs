use serde_json::{json, Value};
use std::{fs, path::Path};

pub fn migrate_manifest_value(value: Value) -> (Value, bool) {
    let mut changed = false;
    let mut value = value;
    let Some(object) = value.as_object_mut() else {
        return (value, false);
    };

    if object.get("version").and_then(Value::as_u64).unwrap_or(0) < 2 {
        object.insert("version".to_string(), Value::from(2_u64));
        changed = true;
    }
    if object.get("renderMode").and_then(Value::as_str) != Some("isometric") {
        object.insert("renderMode".to_string(), Value::String("isometric".to_string()));
        changed = true;
    }
    if !object.contains_key("ambientLight") {
        object.insert("ambientLight".to_string(), Value::from(0.76_f64));
        changed = true;
    }
    if !object.contains_key("metadata") {
        object.insert(
            "metadata".to_string(),
            json!({
                "migration": "v2-isometric",
            }),
        );
        changed = true;
    }

    (value, changed)
}

pub fn load_and_upgrade_manifest(path: &Path) -> Result<Value, String> {
    let content = fs::read_to_string(path)
        .map_err(|error| format!("Failed to read exploration manifest: {error}"))?;
    let value = serde_json::from_str::<Value>(&content)
        .map_err(|error| format!("Failed to parse exploration manifest: {error}"))?;
    let (upgraded, changed) = migrate_manifest_value(value);
    if changed {
        let serialized = serde_json::to_string_pretty(&upgraded)
            .map_err(|error| format!("Failed to serialize upgraded exploration manifest: {error}"))?;
        fs::write(path, serialized)
            .map_err(|error| format!("Failed to rewrite upgraded exploration manifest: {error}"))?;
    }
    Ok(upgraded)
}
