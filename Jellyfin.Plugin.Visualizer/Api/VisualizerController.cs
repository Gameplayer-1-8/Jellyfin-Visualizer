using System.IO;
using System.Net.Mime;
using System.Reflection;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.Visualizer.Api;

/// <summary>
/// Controller to serve visualizer web assets.
/// </summary>
[ApiController]
[Route("Visualizer")]
public class VisualizerController : ControllerBase
{
    /// <summary>
    /// Gets the visualizer JavaScript file.
    /// </summary>
    /// <returns>The JavaScript content.</returns>
    [HttpGet("visualizer.js")]
    [AllowAnonymous]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public ActionResult GetVisualizerJs()
    {
        var assembly = Assembly.GetExecutingAssembly();
        var resourceName = "Jellyfin.Plugin.Visualizer.Web.visualizer.js";
        var stream = assembly.GetManifestResourceStream(resourceName);

        if (stream == null)
        {
            return NotFound();
        }

        return File(stream, "application/javascript");
    }

    /// <summary>
    /// Gets the visualizer CSS file.
    /// </summary>
    /// <returns>The CSS content.</returns>
    [HttpGet("visualizer.css")]
    [AllowAnonymous]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public ActionResult GetVisualizerCss()
    {
        var assembly = Assembly.GetExecutingAssembly();
        var resourceName = "Jellyfin.Plugin.Visualizer.Web.visualizer.css";
        var stream = assembly.GetManifestResourceStream(resourceName);

        if (stream == null)
        {
            return NotFound();
        }

        return File(stream, "text/css");
    }

    /// <summary>
    /// Gets the current visualizer configuration.
    /// </summary>
    /// <returns>Configuration JSON.</returns>
    [HttpGet("config")]
    [AllowAnonymous]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public ActionResult GetConfig()
    {
        var config = Plugin.Instance?.Configuration;
        if (config == null)
        {
            return Ok(new { enabled = true, mode = "Bars", colorScheme = "Neon", sensitivity = 5 });
        }

        return Ok(new
        {
            enabled = config.Enabled,
            mode = config.DefaultMode.ToString(),
            colorScheme = config.DefaultColorScheme.ToString(),
            sensitivity = config.Sensitivity
        });
    }
}
