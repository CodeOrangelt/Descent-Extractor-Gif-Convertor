const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const texturesDir = './converted/textures';
const outputDir = './converted/gifs';

// Ensure output directory exists
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

function groupImagesByBaseName() {
    const files = fs.readdirSync(texturesDir);
    const groups = {};
    
    files.forEach(file => {
        if (path.extname(file) === '.png') {
            // Extract base name (everything before the last underscore and number)
            const match = file.match(/^(.+)_(\d+)\.png$/);
            if (match) {
                const baseName = match[1];
                const frameNumber = parseInt(match[2]);
                
                if (!groups[baseName]) {
                    groups[baseName] = [];
                }
                
                groups[baseName].push({
                    file: file,
                    frame: frameNumber,
                    path: path.join(texturesDir, file)
                });
            }
        }
    });
    
    // Sort frames and filter groups with multiple frames
    Object.keys(groups).forEach(baseName => {
        groups[baseName].sort((a, b) => a.frame - b.frame);
        if (groups[baseName].length < 2) {
            delete groups[baseName];
        }
    });
    
    return groups;
}

function createGifWithImageMagick(baseName, frames) {
    return new Promise((resolve, reject) => {
        const inputFiles = frames.map(frame => `"${frame.path}"`).join(' ');
        const outputPath = path.join(outputDir, `${baseName}.gif`);
        
        // Determine which command to use
        let command;
        if (global.imageMagickPath) {
            command = `${global.imageMagickPath} -delay 10 -loop 0 -dispose previous ${inputFiles} -coalesce -layers optimize "${outputPath}"`;
        } else {
            command = `magick -delay 10 -loop 0 -dispose previous ${inputFiles} -coalesce -layers optimize "${outputPath}"`;
        }
        
        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error creating GIF for ${baseName}:`, error.message);
                reject(error);
            } else {
                console.log(`✓ Created: ${baseName}.gif (${frames.length} frames)`);
                resolve(outputPath);
            }
        });
    });
}

function createGifWithFFmpeg(baseName, frames) {
    return new Promise((resolve, reject) => {
        // Create a temporary text file listing the frames
        const listFile = path.join(outputDir, `${baseName}_list.txt`);
        const listContent = frames.map(frame => `file '${path.resolve(frame.path)}'`).join('\n');
        
        fs.writeFileSync(listFile, listContent);
        
        const outputPath = path.join(outputDir, `${baseName}.gif`);
        
        // Using FFmpeg to create animated GIF
        const paletteFile = path.join(outputDir, `${baseName}_palette.png`);
        const command1 = `ffmpeg -f concat -safe 0 -i "${listFile}" -vf "fps=10,scale=320:-1:flags=lanczos,palettegen" -y "${paletteFile}"`;
        const command2 = `ffmpeg -f concat -safe 0 -i "${listFile}" -i "${paletteFile}" -lavfi "fps=10,scale=320:-1:flags=lanczos[x];[x][1:v]paletteuse" -y "${outputPath}"`;
        
        exec(command1, (error1) => {
            if (error1) {
                reject(error1);
                return;
            }
            
            exec(command2, (error2, stdout, stderr) => {
                // Clean up temporary files
                try {
                    fs.unlinkSync(listFile);
                    fs.unlinkSync(paletteFile);
                } catch (e) {}
                
                if (error2) {
                    console.error(`Error creating GIF for ${baseName}:`, error2.message);
                    reject(error2);
                } else {
                    console.log(`✓ Created: ${baseName}.gif (${frames.length} frames)`);
                    resolve(outputPath);
                }
            });
        });
    });
}

async function createGifs(groups) {
    const groupNames = Object.keys(groups);
    console.log(`\nCreating ${groupNames.length} animated GIFs...`);
    
    let successCount = 0;
    let failCount = 0;
    
    for (const baseName of groupNames) {
        try {
            // Try ImageMagick first, fallback to FFmpeg
            await createGifWithImageMagick(baseName, groups[baseName]);
            successCount++;
        } catch (error) {
            try {
                await createGifWithFFmpeg(baseName, groups[baseName]);
                successCount++;
            } catch (ffmpegError) {
                console.error(`✗ Failed to create GIF for ${baseName}`);
                failCount++;
            }
        }
    }
    
    console.log(`\n Done! Created ${successCount} GIFs${failCount > 0 ? `, ${failCount} failed` : ''}`);
    console.log(`📁 Check the ./converted/gifs/ directory for your animated textures.`);
}

// Check if required tools are available
function checkDependencies() {
    return new Promise((resolve) => {
        // Try standard magick command first
        exec('magick -version', (error) => {
            if (!error) {
                console.log('ImageMagick detected');
                resolve('imagemagick');
                return;
            }
            
            // Try convert command (older ImageMagick)
            exec('convert -version', (error) => {
                if (!error) {
                    console.log('ImageMagick detected (convert)');
                    resolve('imagemagick-convert');
                    return;
                }
                
                // Debug: Check MAGICK_PATH environment variable
                const magickPath = process.env.MAGICK_PATH;
                console.log(`Checking MAGICK_PATH: ${magickPath}`);
                
                if (magickPath) {
                    console.log(` MAGICK_PATH exists, checking if file exists: ${fs.existsSync(magickPath)}`);
                    if (fs.existsSync(magickPath)) {
                        console.log(`ImageMagick found via MAGICK_PATH: ${magickPath}`);
                        global.imageMagickPath = `"${magickPath}"`;
                        resolve('imagemagick-path');
                        return;
                    } else {
                        console.log(`MAGICK_PATH points to non-existent file: ${magickPath}`);
                    }
                } else {
                    console.log('MAGICK_PATH environment variable not found');
                }
                
                // Try common installation paths
                console.log('🔍 Searching common installation paths...');
                const commonPaths = [
                    'C:\\Program Files\\ImageMagick-7.1.2-Q16-HDRI\\magick.exe',
                    'C:\\Program Files\\ImageMagick-7.1.1-Q16-HDRI\\magick.exe',
                    'C:\\Program Files\\ImageMagick-7.1.0-Q16-HDRI\\magick.exe',
                    'C:\\Program Files\\ImageMagick\\magick.exe',
                    'C:\\ImageMagick\\magick.exe'
                ];
                
                let found = false;
                for (const imageMagickPath of commonPaths) {
                    console.log(`🔍 Checking: ${imageMagickPath}`);
                    if (fs.existsSync(imageMagickPath)) {
                        console.log(`✓ ImageMagick found at: ${imageMagickPath}`);
                        global.imageMagickPath = `"${imageMagickPath}"`;
                        resolve('imagemagick-path');
                        found = true;
                        break;
                    }
                }
                
                if (!found) {
                    console.log('Trying FFmpeg...');
                    exec('ffmpeg -version', (error) => {
                        if (!error) {
                            console.log('FFmpeg detected');
                            resolve('ffmpeg');
                        } else {
                            console.log('No image processing tools found');
                            resolve(null);
                        }
                    });
                }
            });
        });
    });
}

async function main() {
    console.log('Descent Texture GIF Creator');
    console.log('===============================');
    
    if (!fs.existsSync(texturesDir)) {
        console.error(`Textures directory not found: ${texturesDir}`);
        console.log('Please run the extractor first to generate textures.');
        process.exit(1);
    }
    
    console.log('📂 Scanning for texture sequences...');
    const groups = groupImagesByBaseName();
    
    const groupNames = Object.keys(groups);
    if (groupNames.length === 0) {
        console.log('No image sequences found.');
        return;
    }
    
    console.log(`Found ${groupNames.length} texture sequences:`);
    groupNames.slice(0, 10).forEach(name => {
        console.log(`   • ${name}: ${groups[name].length} frames`);
    });
    if (groupNames.length > 10) {
        console.log(`   ... and ${groupNames.length - 10} more`);
    }
    
    let tool = await checkDependencies();
    
    if (!tool) {
        console.log('No image processing tools found. Attempting to install ImageMagick...');
        try {
            await installImageMagick();
            console.log('ImageMagick installed successfully!');
            console.log('Please restart your terminal/PowerShell and run the script again.');
            console.log('   Or run: refreshenv (if using chocolatey)');
            process.exit(0);
        } catch (error) {
            console.error('Failed to install ImageMagick automatically.');
            console.log('\nPlease install manually:');
            console.log('   • ImageMagick: https://imagemagick.org/script/download.php');
            console.log('   • FFmpeg: https://ffmpeg.org/download.html');
            console.log('   • Or use: winget install ImageMagick.ImageMagick');
            process.exit(1);
        }
    }
    
    await createGifs(groups);
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = { groupImagesByBaseName, createGifs };