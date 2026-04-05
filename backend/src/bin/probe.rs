use airwave_server::wiim::probe::probe_device;

#[tokio::main]
async fn main() {
    let args: Vec<String> = std::env::args().collect();
    let host = args.get(1).map(|s| s.as_str()).unwrap_or("192.168.66.118");
    let port: u16 = args.get(2).and_then(|s| s.parse().ok()).unwrap_or(49152);

    eprintln!("Probing {}:{}...\n", host, port);

    match probe_device(host, port).await {
        Ok(schema) => {
            println!("{}", serde_json::to_string_pretty(&schema).unwrap());
        }
        Err(e) => {
            eprintln!("Error: {}", e);
            std::process::exit(1);
        }
    }
}
