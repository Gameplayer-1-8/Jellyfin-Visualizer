using System;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using MediaBrowser.Controller;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.Visualizer;

/// <summary>
/// Hosted service that automatically injects the visualizer script into
/// Jellyfin's index.html at startup and removes it on shutdown.
/// </summary>
public class VisualizerInjector : IHostedService
{
    private readonly IServerApplicationHost _appHost;
    private readonly ILogger<VisualizerInjector> _logger;
    private string? _indexPath;

    private const string ScriptTag = "<script src=\"/Visualizer/visualizer.js\" defer></script>";
    private const string ScriptComment = "<!-- Jellyfin Music Visualizer Plugin -->";
    private const string InjectionMarker = "<!-- JF-VISUALIZER-INJECTED -->";
    private const string CssTag = "<link rel=\"stylesheet\" href=\"/Visualizer/visualizer.css\" />";

    /// <summary>
    /// Initializes a new instance of the <see cref="VisualizerInjector"/> class.
    /// </summary>
    /// <param name="appHost">The server application host.</param>
    /// <param name="logger">Logger instance.</param>
    public VisualizerInjector(IServerApplicationHost appHost, ILogger<VisualizerInjector> logger)
    {
        _appHost = appHost;
        _logger = logger;
    }

    /// <inheritdoc />
    public Task StartAsync(CancellationToken cancellationToken)
    {
        try
        {
            _indexPath = FindIndexHtml();

            if (_indexPath == null)
            {
                _logger.LogWarning("[Visualizer] Could not find jellyfin-web index.html – script injection skipped.");
                return Task.CompletedTask;
            }

            InjectScript(_indexPath);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[Visualizer] Error during script injection");
        }

        return Task.CompletedTask;
    }

    /// <inheritdoc />
    public Task StopAsync(CancellationToken cancellationToken)
    {
        try
        {
            if (_indexPath != null && File.Exists(_indexPath))
            {
                RemoveScript(_indexPath);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[Visualizer] Error removing injected script");
        }

        return Task.CompletedTask;
    }

    private string? FindIndexHtml()
    {
        // Strategy 1: Use the IServerApplicationHost to get the web path
        // The web client files are typically served from a known location
        var webPath = GetWebClientPath();

        if (webPath != null)
        {
            var indexPath = Path.Combine(webPath, "index.html");
            if (File.Exists(indexPath))
            {
                _logger.LogInformation("[Visualizer] Found index.html at: {Path}", indexPath);
                return indexPath;
            }
        }

        // Strategy 2: Common paths
        string[] commonPaths = new[]
        {
            // Docker / Linux
            "/jellyfin/jellyfin-web/index.html",
            "/usr/share/jellyfin/web/index.html",
            "/usr/lib/jellyfin/web/index.html",
            // Windows
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Jellyfin", "Server", "jellyfin-web", "index.html"),
            Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "jellyfin-web", "index.html"),
            Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "web", "index.html"),
        };

        foreach (var path in commonPaths)
        {
            if (File.Exists(path))
            {
                _logger.LogInformation("[Visualizer] Found index.html at: {Path}", path);
                return path;
            }
        }

        return null;
    }

    private string? GetWebClientPath()
    {
        try
        {
            // Try to get web path from the application host
            var appHostType = _appHost.GetType();

            // Try IServerApplicationHost.GetApiUrlForLocalAccess or similar to derive the web path
            // The most reliable method is checking the base directory structure
            var baseDir = AppDomain.CurrentDomain.BaseDirectory;

            // Check common relative paths from the server binary
            var candidates = new[]
            {
                Path.Combine(baseDir, "jellyfin-web"),
                Path.Combine(baseDir, "web"),
                Path.Combine(baseDir, "..", "jellyfin-web"),
                Path.Combine(baseDir, "..", "web"),
            };

            foreach (var candidate in candidates)
            {
                if (Directory.Exists(candidate))
                {
                    return Path.GetFullPath(candidate);
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "[Visualizer] Could not determine web client path from app host");
        }

        return null;
    }

    private void InjectScript(string indexPath)
    {
        var content = File.ReadAllText(indexPath);

        // Already injected?
        if (content.Contains(InjectionMarker))
        {
            _logger.LogInformation("[Visualizer] Script already injected, skipping.");
            return;
        }

        // Build injection block
        var injection = $"\n    {ScriptComment}\n    {InjectionMarker}\n    {CssTag}\n    {ScriptTag}\n";

        // Inject before </body>
        var bodyCloseIdx = content.LastIndexOf("</body>", StringComparison.OrdinalIgnoreCase);
        if (bodyCloseIdx >= 0)
        {
            content = content.Insert(bodyCloseIdx, injection);
        }
        else
        {
            // Fallback: inject before </html>
            var htmlCloseIdx = content.LastIndexOf("</html>", StringComparison.OrdinalIgnoreCase);
            if (htmlCloseIdx >= 0)
            {
                content = content.Insert(htmlCloseIdx, injection);
            }
            else
            {
                // Last resort: append
                content += injection;
            }
        }

        File.WriteAllText(indexPath, content);
        _logger.LogInformation("[Visualizer] Successfully injected visualizer script into index.html");
    }

    private void RemoveScript(string indexPath)
    {
        var content = File.ReadAllText(indexPath);

        if (!content.Contains(InjectionMarker))
        {
            return;
        }

        // Remove the entire injection block
        // Find the comment start and the script tag end
        var markerIdx = content.IndexOf(ScriptComment, StringComparison.OrdinalIgnoreCase);
        if (markerIdx < 0)
        {
            markerIdx = content.IndexOf(InjectionMarker, StringComparison.OrdinalIgnoreCase);
        }

        var scriptEndIdx = content.IndexOf(ScriptTag, StringComparison.OrdinalIgnoreCase);
        if (scriptEndIdx >= 0)
        {
            scriptEndIdx += ScriptTag.Length;
        }

        if (markerIdx >= 0 && scriptEndIdx > markerIdx)
        {
            // Find the start of the line (go back to newline)
            var lineStart = content.LastIndexOf('\n', markerIdx);
            if (lineStart < 0) lineStart = markerIdx;

            // Find the end (after script tag + possible newline)
            var lineEnd = scriptEndIdx;
            if (lineEnd < content.Length && content[lineEnd] == '\n')
            {
                lineEnd++;
            }

            content = content.Remove(lineStart, lineEnd - lineStart);
            File.WriteAllText(indexPath, content);
            _logger.LogInformation("[Visualizer] Successfully removed visualizer script from index.html");
        }
        else
        {
            // Fallback: just remove individual lines
            content = content.Replace(ScriptComment, string.Empty);
            content = content.Replace(InjectionMarker, string.Empty);
            content = content.Replace(CssTag, string.Empty);
            content = content.Replace(ScriptTag, string.Empty);
            File.WriteAllText(indexPath, content);
            _logger.LogInformation("[Visualizer] Cleaned up visualizer references from index.html");
        }
    }
}
