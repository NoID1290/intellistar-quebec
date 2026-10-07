#include <iostream>
#include <string>
#include <vector>
#include <thread>
#include <atomic>
#include <csignal>
#include <cstdint>
#include <cstring>
#include <algorithm>
#include <unistd.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <poll.h>

#include <Processing.NDI.Lib.h>
#include <Processing.NDI.utilities.h>
#include <Processing.NDI.Find.h>
#include <Processing.NDI.Recv.h>

static std::atomic<bool> g_running(true);

static void sig_handler(int) {
    g_running.store(false);
}

// Case-insensitive substring matching helper
static bool contains_ci(const std::string& str, const std::string& substr) {
    if (substr.empty()) return true;
    auto it = std::search(
        str.begin(), str.end(),
        substr.begin(), substr.end(),
        [](char ch1, char ch2) { return std::tolower(ch1) == std::tolower(ch2); }
    );
    return (it != str.end());
}

// Audio receiver worker thread (reads raw 16-bit 48kHz stereo PCM over UDP from FFmpeg)
void audio_worker(NDIlib_send_instance_t pNDI, int port, std::atomic<long long>* audio_packets_counter) {
    int sock = socket(AF_INET, SOCK_DGRAM, 0);
    if (sock < 0) {
        std::cerr << "[NDI-Bridge] Warning: Could not create audio UDP socket.\n";
        return;
    }

    int reuse = 1;
    setsockopt(sock, SOL_SOCKET, SO_REUSEADDR, &reuse, sizeof(reuse));

    sockaddr_in addr{};
    addr.sin_family = AF_INET;
    addr.sin_port = htons(port);
    addr.sin_addr.s_addr = inet_addr("127.0.0.1");

    if (bind(sock, (struct sockaddr*)&addr, sizeof(addr)) < 0) {
        std::cerr << "[NDI-Bridge] Warning: Could not bind audio UDP port " << port << ".\n";
        close(sock);
        return;
    }

    struct pollfd pfd{};
    pfd.fd = sock;
    pfd.events = POLLIN;

    std::vector<uint8_t> recv_buf(16384);
    NDIlib_audio_frame_interleaved_16s_t audio_frame;
    audio_frame.sample_rate = 48000;
    audio_frame.no_channels = 2;
    audio_frame.reference_level = 0;

    while (g_running.load()) {
        int ret = poll(&pfd, 1, 200);
        if (ret > 0 && (pfd.revents & POLLIN)) {
            ssize_t bytes = recv(sock, recv_buf.data(), recv_buf.size(), 0);
            if (bytes > 0) {
                int samples = bytes / (2 * sizeof(int16_t));
                if (samples > 0) {
                    audio_frame.no_samples = samples;
                    audio_frame.p_data = reinterpret_cast<int16_t*>(recv_buf.data());
                    NDIlib_util_send_send_audio_interleaved_16s(pNDI, &audio_frame);
                    (*audio_packets_counter)++;
                }
            }
        }
    }

    close(sock);
}

int run_list(const std::string& extra_ips) {
    if (!NDIlib_initialize()) {
        std::cerr << "[NDI-Bridge] Fatal: NDIlib_initialize() failed.\n";
        return 1;
    }
    const char* p_ips = extra_ips.empty() ? nullptr : extra_ips.c_str();
    NDIlib_find_create_t find_desc(true, nullptr, p_ips);
    NDIlib_find_instance_t pFind = NDIlib_find_create_v2(&find_desc);
    if (!pFind) {
        std::cerr << "[NDI-Bridge] Fatal: Failed to create NDI source finder.\n";
        NDIlib_destroy();
        return 1;
    }

    std::cout << "[NDI-Bridge] Scanning for active NDI sources"
              << (extra_ips.empty() ? "" : " on " + extra_ips) << " (2s)...\n" << std::flush;
    NDIlib_find_wait_for_sources(pFind, 2000);
    uint32_t num = 0;
    const NDIlib_source_t* sources = NDIlib_find_get_current_sources(pFind, &num);

    if (num == 0) {
        std::cout << "[NDI-Bridge] No active NDI sources found on the local network.\n";
    } else {
        std::cout << "[NDI-Bridge] Found " << num << " active NDI source(s):\n";
        for (uint32_t i = 0; i < num; i++) {
            std::cout << "  - \"" << sources[i].p_ndi_name << "\" ("
                      << (sources[i].p_url_address ? sources[i].p_url_address : "") << ")\n";
        }
    }

    NDIlib_find_destroy(pFind);
    NDIlib_destroy();
    return 0;
}


static bool write_all(int fd, const uint8_t* data, size_t len) {
    size_t written = 0;
    while (written < len && g_running.load()) {
        ssize_t n = write(fd, data + written, len - written);
        if (n > 0) {
            written += n;
        } else if (n < 0) {
            if (errno == EINTR) continue;
            return false;
        } else {
            return false;
        }
    }
    return (written == len);
}

void recv_audio_worker(NDIlib_recv_instance_t pNDI_recv, int port, std::atomic<long long>* audio_counter) {
    if (port <= 0) return;
    int audio_sock = socket(AF_INET, SOCK_DGRAM, 0);
    if (audio_sock < 0) return;
    sockaddr_in audio_dest{};
    audio_dest.sin_family = AF_INET;
    audio_dest.sin_port = htons(port);
    audio_dest.sin_addr.s_addr = inet_addr("127.0.0.1");

    while (g_running.load()) {
        NDIlib_audio_frame_v2_t a_frame;
        NDIlib_frame_type_e type = NDIlib_recv_capture_v2(pNDI_recv, nullptr, &a_frame, nullptr, 100);
        if (type == NDIlib_frame_type_audio) {
            if (a_frame.p_data) {
                NDIlib_audio_frame_interleaved_16s_t interleaved;
                interleaved.reference_level = 0;
                std::vector<int16_t> pcm_buf(a_frame.no_samples * 2);
                interleaved.p_data = pcm_buf.data();
                NDIlib_util_audio_to_interleaved_16s_v2(&a_frame, &interleaved);
                sendto(audio_sock, pcm_buf.data(), pcm_buf.size() * sizeof(int16_t), 0,
                       (struct sockaddr*)&audio_dest, sizeof(audio_dest));
                (*audio_counter)++;
            }
            NDIlib_recv_free_audio_v2(pNDI_recv, &a_frame);
        }
    }
    close(audio_sock);
}

int run_receiver(const std::string& target_source, const std::string& extra_ips, int audio_port) {
    if (!NDIlib_initialize()) {
        std::cerr << "[NDI-Bridge] Fatal: NDIlib_initialize() failed.\n";
        return 1;
    }

    const char* p_ips = extra_ips.empty() ? nullptr : extra_ips.c_str();
    NDIlib_find_create_t find_desc(true, nullptr, p_ips);
    NDIlib_find_instance_t pFind = NDIlib_find_create_v2(&find_desc);
    if (!pFind) {
        std::cerr << "[NDI-Bridge] Fatal: Failed to create NDI finder.\n";
        NDIlib_destroy();
        return 1;
    }

    std::cerr << "[NDI-Bridge] Searching for NDI source matching '" << target_source << "'"
              << (extra_ips.empty() ? "" : " on " + extra_ips) << "...\n" << std::flush;

    NDIlib_source_t matched_source{};
    bool found = false;

    while (g_running.load() && !found) {
        NDIlib_find_wait_for_sources(pFind, 1000);
        uint32_t num = 0;
        const NDIlib_source_t* sources = NDIlib_find_get_current_sources(pFind, &num);
        for (uint32_t i = 0; i < num; i++) {
            std::string sname = sources[i].p_ndi_name ? sources[i].p_ndi_name : "";
            if (target_source.empty() || contains_ci(sname, target_source)) {
                matched_source = sources[i];
                found = true;
                break;
            }
        }
        if (!found && g_running.load()) {
            std::cerr << "[NDI-Bridge] Waiting for '" << target_source << "' to appear on network...\n" << std::flush;
        }
    }

    if (!found || !g_running.load()) {
        NDIlib_find_destroy(pFind);
        NDIlib_destroy();
        return 0;
    }

    std::cerr << "[NDI-Bridge] Connected to '" << matched_source.p_ndi_name << "' ("
              << (matched_source.p_url_address ? matched_source.p_url_address : "auto") << ")...\n" << std::flush;

    NDIlib_recv_create_v3_t recv_desc;
    recv_desc.source_to_connect_to = matched_source;
    recv_desc.color_format = NDIlib_recv_color_format_UYVY_RGBA;
    recv_desc.bandwidth = NDIlib_recv_bandwidth_highest;
    recv_desc.allow_video_fields = false;

    NDIlib_recv_instance_t pNDI_recv = NDIlib_recv_create_v3(&recv_desc);
    if (!pNDI_recv) {
        std::cerr << "[NDI-Bridge] Fatal: Failed to create NDI receiver.\n";
        NDIlib_find_destroy(pFind);
        NDIlib_destroy();
        return 1;
    }

    int audio_sock = -1;
    sockaddr_in audio_dest{};
    std::atomic<long long> video_frames(0);
    std::atomic<long long> audio_packets(0);

    std::thread audio_thread;
    if (audio_port > 0) {
        audio_sock = socket(AF_INET, SOCK_DGRAM, 0);
        audio_dest.sin_family = AF_INET;
        audio_dest.sin_port = htons(audio_port);
        audio_dest.sin_addr.s_addr = inet_addr("127.0.0.1");
        audio_thread = std::thread(recv_audio_worker, pNDI_recv, audio_port, &audio_packets);
    }

    std::cerr << "[NDI-Bridge] Streaming raw video to stdout...\n" << std::flush;

    long long video_frames = 0;
    long long audio_packets = 0;

    while (g_running.load()) {
        NDIlib_video_frame_v2_t v_frame;
        NDIlib_audio_frame_v2_t a_frame;

        NDIlib_frame_type_e type = NDIlib_recv_capture_v2(pNDI_recv, &v_frame, &a_frame, nullptr, 500);
        NDIlib_frame_type_e type = NDIlib_recv_capture_v2(pNDI_recv, &v_frame, nullptr, nullptr, 100);
        if (type == NDIlib_frame_type_video) {
            if (v_frame.p_data) {
                size_t bytes = static_cast<size_t>(v_frame.yres) * v_frame.line_stride_in_bytes;
                size_t written = 0;
                while (written < bytes && g_running.load()) {
                    ssize_t n = write(STDOUT_FILENO, v_frame.p_data + written, bytes - written);
                    if (n > 0) written += n;
                    else if (n < 0 && errno != EINTR) { g_running.store(false); break; }
                const size_t row_bytes = static_cast<size_t>(v_frame.xres) * 2;
                if (static_cast<size_t>(v_frame.line_stride_in_bytes) == row_bytes) {
                    if (!write_all(STDOUT_FILENO, v_frame.p_data, row_bytes * v_frame.yres)) {
                        g_running.store(false);
                        NDIlib_recv_free_video_v2(pNDI_recv, &v_frame);
                        break;
                    }
                } else {
                    const uint8_t* row = v_frame.p_data;
                    bool ok = true;
                    for (int y = 0; y < v_frame.yres && g_running.load(); y++) {
                        if (!write_all(STDOUT_FILENO, row, row_bytes)) {
                            ok = false;
                            break;
                        }
                        row += v_frame.line_stride_in_bytes;
                    }
                    if (!ok) {
                        g_running.store(false);
                        NDIlib_recv_free_video_v2(pNDI_recv, &v_frame);
                        break;
                    }
                }
                video_frames++;
            }
            NDIlib_recv_free_video_v2(pNDI_recv, &v_frame);
        } else if (type == NDIlib_frame_type_audio) {
            if (a_frame.p_data && audio_sock >= 0) {
                NDIlib_audio_frame_interleaved_16s_t interleaved;
                interleaved.reference_level = 0;
                std::vector<int16_t> pcm_buf(a_frame.no_samples * 2);
                interleaved.p_data = pcm_buf.data();
                NDIlib_util_audio_to_interleaved_16s_v2(&a_frame, &interleaved);
                sendto(audio_sock, pcm_buf.data(), pcm_buf.size() * sizeof(int16_t), 0,
                       (struct sockaddr*)&audio_dest, sizeof(audio_dest));
                audio_packets++;
            }
            NDIlib_recv_free_audio_v2(pNDI_recv, &a_frame);
        }
    }

    if (audio_sock >= 0) close(audio_sock);
    g_running.store(false);
    if (audio_thread.joinable()) {
        audio_thread.join();
    }

    NDIlib_recv_destroy(pNDI_recv);
    NDIlib_find_destroy(pFind);
    NDIlib_destroy();

    std::cerr << "[NDI-Bridge] Receiver stopped. Received " << video_frames << " frames, " << audio_packets << " audio packets.\n" << std::flush;
    std::cerr << "[NDI-Bridge] Receiver stopped. Received " << video_frames.load()
              << " frames, " << audio_packets.load() << " audio packets.\n" << std::flush;
    return 0;
}

int main(int argc, char* argv[]) {
    bool is_list = false;
    bool is_recv = false;
    std::string stream_name = "IntelliSTAR";
    std::string extra_ips = "";
    int width = 1280;
    int height = 720;
    int fps = 30;
    std::string pixfmt = "uyvy422";
    int audio_port = 18890;

    for (int i = 1; i < argc; i++) {
        std::string arg = argv[i];
        if (arg == "--list" || arg == "-l") {
            is_list = true;
        } else if (arg == "--recv" || arg == "-r") {
            is_recv = true;
        } else if ((arg == "--source" || arg == "-s") && i + 1 < argc) {
            stream_name = argv[++i];
            is_recv = true;
        } else if ((arg == "--name" || arg == "-n") && i + 1 < argc) {
            stream_name = argv[++i];
        } else if ((arg == "--ip" || arg == "--extra-ips") && i + 1 < argc) {
            extra_ips = argv[++i];
        } else if (arg == "--width" && i + 1 < argc) {
            width = std::stoi(argv[++i]);
        } else if (arg == "--height" && i + 1 < argc) {
            height = std::stoi(argv[++i]);
        } else if (arg == "--fps" && i + 1 < argc) {
            fps = std::stoi(argv[++i]);
        } else if (arg == "--pixfmt" && i + 1 < argc) {
            pixfmt = argv[++i];
        } else if (arg == "--audio-port" && i + 1 < argc) {
            audio_port = std::stoi(argv[++i]);
        } else if (arg == "--help" || arg == "-h") {
            std::cout << "Usage: ndi-bridge [options]\n\n"
                      << "General Options:\n"
                      << "  --list, -l           Discover and list active NDI sources on LAN\n"
                      << "  --ip <ip>            Target IP address to scan directly (bypasses mDNS block)\n"
                      << "  --help, -h           Show this help message\n\n"
                      << "Sender Mode (default):\n"
                      << "  --name <str>         NDI stream name (default: IntelliSTAR)\n"
                      << "  --width <int>        Video width (default: 1280)\n"
                      << "  --height <int>       Video height (default: 720)\n"
                      << "  --fps <int>          Video framerate (default: 30)\n"
                      << "  --pixfmt <str>       Pixel format: uyvy422, bgra, rgba (default: uyvy422)\n"
                      << "  --audio-port <int>   UDP port for incoming PCM audio from FFmpeg (default: 18890)\n\n"
                      << "Receiver Mode:\n"
                      << "  --recv, -r           Enable receiver mode\n"
                      << "  --source <str>       NDI stream to receive (substring match, default: IntelliSTAR)\n"
                      << "  --ip <ip>            Direct IP address of broadcaster (e.g. 10.0.0.205)\n"
                      << "  --audio-port <int>   UDP port to forward PCM audio to FFmpeg (default: 18890)\n";
            return 0;
        } else if (!arg.empty() && arg[0] != '-') {
            stream_name = arg;
        }
    }

    signal(SIGINT, sig_handler);
    signal(SIGTERM, sig_handler);
    signal(SIGPIPE, SIG_IGN);

    if (is_list) {
        return run_list(extra_ips);
    }

    if (is_recv) {
        return run_receiver(stream_name, extra_ips, audio_port);
    }

    // Sender mode
    if (!NDIlib_initialize()) {
        std::cerr << "[NDI-Bridge] Fatal: NDIlib_initialize() failed. NDI CPU requirements not met.\n";
        return 1;
    }

    NDIlib_send_create_t create_desc(stream_name.c_str(), nullptr, true, false);
    NDIlib_send_instance_t pNDI = NDIlib_send_create(&create_desc);
    if (!pNDI) {
        std::cerr << "[NDI-Bridge] Fatal: Failed to create NDI sender instance '" << stream_name << "'.\n";
        NDIlib_destroy();
        return 1;
    }

    NDIlib_FourCC_video_type_e fourcc = NDIlib_FourCC_type_UYVY;
    int bytes_per_pixel = 2;
    if (pixfmt == "bgra") {
        fourcc = NDIlib_FourCC_type_BGRA;
        bytes_per_pixel = 4;
    } else if (pixfmt == "rgba") {
        fourcc = NDIlib_FourCC_type_RGBA;
        bytes_per_pixel = 4;
    }

    const size_t frame_size = static_cast<size_t>(width) * height * bytes_per_pixel;
    const int line_stride = width * bytes_per_pixel;

    std::cout << "[NDI-Bridge] Broadcasting '" << stream_name << "' over LAN via NDI "
              << "(" << width << "x" << height << " @ " << fps << "fps, "
              << pixfmt << ", audio UDP :" << audio_port << ")...\n" << std::flush;

    std::atomic<long long> audio_packets_counter(0);
    std::thread audio_thread;
    if (audio_port > 0) {
        audio_thread = std::thread(audio_worker, pNDI, audio_port, &audio_packets_counter);
    }

    NDIlib_video_frame_v2_t video_frame;
    video_frame.xres = width;
    video_frame.yres = height;
    video_frame.FourCC = fourcc;
    video_frame.line_stride_in_bytes = line_stride;
    video_frame.frame_format_type = NDIlib_frame_format_type_progressive;
    video_frame.frame_rate_N = fps;
    video_frame.frame_rate_D = 1;
    video_frame.picture_aspect_ratio = static_cast<float>(width) / static_cast<float>(height);

    std::vector<uint8_t> frame_buffer(frame_size);
    long long video_frames = 0;

    while (g_running.load()) {
        size_t total_read = 0;
        while (total_read < frame_size && g_running.load()) {
            ssize_t n = read(STDIN_FILENO, frame_buffer.data() + total_read, frame_size - total_read);
            if (n > 0) {
                total_read += n;
            } else if (n == 0) {
                g_running.store(false);
                break;
            } else {
                if (errno == EINTR) continue;
                std::cerr << "[NDI-Bridge] Error reading from stdin: " << strerror(errno) << "\n";
                g_running.store(false);
                break;
            }
        }

        if (total_read == frame_size) {
            video_frame.p_data = frame_buffer.data();
            NDIlib_send_send_video_v2(pNDI, &video_frame);
            video_frames++;
        }
    }

    g_running.store(false);
    if (audio_thread.joinable()) {
        audio_thread.join();
    }

    std::cout << "[NDI-Bridge] Broadcast stopped. Transmitted " << video_frames
              << " video frames, " << audio_packets_counter.load() << " audio packets.\n" << std::flush;

    NDIlib_send_destroy(pNDI);
    NDIlib_destroy();
    return 0;
}
