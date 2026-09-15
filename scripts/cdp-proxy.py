import socket
import threading


def relay(source, target):
    try:
        while data := source.recv(65536):
            target.sendall(data)
    except OSError:
        pass
    finally:
        try:
            target.shutdown(socket.SHUT_WR)
        except OSError:
            pass


def connect(client):
    try:
        with client, socket.create_connection(("127.0.0.1", 9222), timeout=5) as target:
            target.settimeout(None)
            upstream = threading.Thread(target=relay, args=(client, target), daemon=True)
            upstream.start()
            relay(target, client)
            upstream.join()
    except OSError:
        client.close()


server = socket.socket()
server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
server.bind(("0.0.0.0", 9223))
server.listen()
while True:
    client, _ = server.accept()
    threading.Thread(target=connect, args=(client,), daemon=True).start()
