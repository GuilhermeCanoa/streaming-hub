import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import ytdl from "@distube/ytdl-core";
import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static"; // Provides a static FFmpeg binary

import { S3Client, PutObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { createReadStream } from 'fs';

@Injectable()
export class AppService {

  async uploadFolderToS3(folderPath: string, bucketName: string): Promise<string[]> {
    try {
      const fileNames = fs.readdirSync(folderPath);
      const filePaths = fileNames.map(fileName => `${folderPath}/${fileName}`);

      const uploadPromises = filePaths.map(filePath => this.uploadToS3(filePath, bucketName));
      return await Promise.all(uploadPromises);
    } catch (error) {
      console.error('Error uploading folder to S3:', error);
      throw new Error('Failed to upload folder to S3');
    }
  }

  async uploadToS3(filePath: string, bucketName: string, bucketFolder?: string): Promise<string> {
    try {
      
      const videoTitle = filePath.split('/')[3];

      bucketFolder = bucketFolder ? `${bucketFolder}` : `videos/hls/${videoTitle}/`;

      const s3Client = new S3Client({
        region: process.env.AWS_REGION || 'sa-east-1'
      });

      const fileStream = createReadStream(filePath);
      const fileName = filePath.split('/').pop();

      const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: `${bucketFolder}${fileName}`,
        Body: fileStream
      });

      await s3Client.send(command);
      
      return `https://${bucketName}.s3.amazonaws.com/${bucketFolder}${fileName}`;

    } catch (error) {
      console.error('Error uploading to S3:', error);
      throw new Error(`Failed to upload ${filePath} to S3`);
    }
  }

  async uploadMultipleToS3(filePaths: string[], bucketName: string): Promise<string[]> {
    try {
      const uploadPromises = filePaths.map(filePath => this.uploadToS3(filePath, bucketName));
      return await Promise.all(uploadPromises);
    } catch (error) {
      console.error('Error uploading multiple files to S3:', error);
      throw new Error('Failed to upload multiple files to S3');
    }
  }

  HDQualityLabels: string[] = [
    // '1080p',
    '720p'
  ]

  async convertToHLS(inputPath: string): Promise<string> {

    const folderName = inputPath.split('.')[0];
    
    const outputDir = `${folderName.replace('mp4', 'hls')}`;
    
    // Criar pasta para os segmentos
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    } else {
      return `${outputDir}`;
    }

    return new Promise((resolve, reject) => {
  
      ffmpeg.setFfmpegPath(ffmpegStatic as string);
  
      ffmpeg(inputPath)
        .outputOptions([
          "-preset veryfast",
          "-g 48", // Intervalo de keyframes
          "-sc_threshold 0",
          "-hls_time 6", // Duração de cada segmento
          "-hls_list_size 0", // Lista de segmentos infinita
          "-hls_segment_filename", `${outputDir}/segment_%03d.ts`, // Padrão dos segmentos
        ])
        .output(`${outputDir}/index.m3u8`)
        .on("end", () => {
          console.log("Conversão para HLS concluída!");
          resolve(`${outputDir}`);
        })
        .on("error", (err) => {
          console.error("Erro ao converter para HLS:", err);
          reject(err);
        })
        .run();
    });
  }

  async mergeAudioAndVideo(videosToBeMerged: string[]): Promise<string> {
    try {
      const videoPath = videosToBeMerged.find(v => v.indexOf('_video') !== -1);
      const audioPath = videosToBeMerged.find(v => v.indexOf('_audio') !== -1);
      const outputPath = videoPath.replace('_video', '_merged');
  
      // check if the files already exists
      if (fs.existsSync(outputPath)) {
        return `${outputPath}`;
      }
    
      ffmpeg.setFfmpegPath(ffmpegStatic as string); // Set static ffmpeg path
      return new Promise((resolve, reject) => {
        ffmpeg()
          .input(videoPath)
          .input(audioPath)
          .outputOptions(["-c:v copy", "-c:a aac"])
          .save(outputPath)
          .on("end", () => {
            console.log("Merge completed!");
            // fs.unlinkSync(videoPath);
            // fs.unlinkSync(audioPath);
            console.log(`Download and merge completed: ${outputPath}`);
            resolve(`${outputPath}`);
          })
          .on("error", err => {
            console.error("FFmpeg error:", err);
            reject(err);
          });
      });
    } catch (error) {
      console.log('error', error);
      error.message = 'Failed to merge audio and video';
      throw error;
    } 
  }

  selectVideoFormats(formats: ytdl.videoFormat[]): ytdl.videoFormat[] {
    try{
      const response : ytdl.videoFormat[] = [];

      // Filter video formats with audio and video
      const formatsWithAudioAndVideo = formats.filter((format) =>
        format.hasAudio
        && format.hasVideo
      )
  
      response.push(formatsWithAudioAndVideo[0]); // pelo menos ter 1 video completo pra baixar sempre
  
      const HDVideoWithAudioAndVideo = formatsWithAudioAndVideo.find(format =>
        this.HDQualityLabels.includes(format.qualityLabel)
        && format.mimeType === 'video/mp4'
      )
  
      if (HDVideoWithAudioAndVideo !== undefined) {
        // Already got the HD video with audio and video, return format
        response.push(HDVideoWithAudioAndVideo);
        return response;
      }
  
      // se nao tem video em HD com audio e video, pegar um video em HD separado, depois pegar um audio em HD separado e juntar os dois
      const HDVideo = formats.find( format =>
        this.HDQualityLabels.includes(format.qualityLabel)
        && format.hasVideo
        && !format.hasAudio
        && format.container === 'mp4'
        && format.codecs.indexOf('avc1') !== -1 //unico formato que rodou no meu player! usar ele sempre
      )
      const HDAudio = formats.find( format =>
        format.mimeType.indexOf('audio/mp4;') !== -1
        // && format.approxDurationMs === HDVideo.approxDurationMs
        && !format.hasVideo
        && format.hasAudio
      )
  
      if (HDVideo !== undefined && HDAudio !== undefined) {
        response.push(HDVideo);
        response.push(HDAudio);
        return response;
      }
      
      return response;
    } catch (error) {
      console.log('error', error);
      error.message = 'Failed to select video formats';
      throw error;
    }
  }

  async downloadVideoYTDL(url:string, options: { format?: ytdl.videoFormat }): Promise<string[]> {
    try {
          // Get video info
          let videoTitle = ';'
          await ytdl.getBasicInfo(url).then(info => {
            console.log(info.videoDetails.title);
            videoTitle = info.videoDetails.title.trim().replace(/[^a-zA-Z0-9]/g, "_");
          });

          // Get video info with download formats
          let info = await ytdl.getInfo(url);

          const selectedFormats = this.selectVideoFormats(info.formats)

          const videosToBeMerged = [];
          const videosReady = [];

          for (const format of selectedFormats) {
            options.format = format;
            // console.log('Downloading video with format:', format);

            const videoFolder = `videos/mp4/${videoTitle}/`;
            
            const videoPathFile = videoFolder
            + videoTitle
            + (format.hasVideo ? '_video' : '')
            + (format.hasAudio ? '_audio' : '')
            + (format.qualityLabel ? '_'+ format.qualityLabel : '')
            + '.mp4';

            // a code to check if the file already exits and then avoid downloading it again
            if (fs.existsSync(videoPathFile)) {
              console.log(`File ${videoPathFile} already exists, skipping download`);
              if (!format.hasVideo || !format.hasAudio) {
                videosToBeMerged.push(videoPathFile);
                console.log(`File ${videoPathFile} added to merge process`);
              } else if (format.hasVideo && format.hasAudio) {
                console.log(`File ${videoPathFile} added to ready videos`);
                videosReady.push(videoPathFile);
              }
              continue;
            } else {
              // create folder if not exists
              fs.mkdirSync(`${videoFolder}`, { recursive: true });
            }

            const writeStream = fs.createWriteStream(`${videoPathFile}`);
            ytdl(url, options).pipe(writeStream);

            await new Promise((resolve, reject) => {
              writeStream.on('finish', () => {
                console.log(`Download of ${videoPathFile} finished !`);
                resolve('success');
              });
              writeStream.on('error', reject);
            });

            if (!format.hasVideo || !format.hasAudio) {
              videosToBeMerged.push(videoPathFile);
              console.log(`File ${videoPathFile} added to merge process`);
            } else if (format.hasVideo && format.hasAudio) {
              console.log(`File ${videoPathFile} added to ready videos`);
              videosReady.push(videoPathFile);
            }

          }

          if (videosToBeMerged.length > 0) {
            const mergedVideoPath = await this.mergeAudioAndVideo(videosToBeMerged);
            videosReady.push(mergedVideoPath);
          }

          return videosReady;
    }
    catch (error) {
      return new Promise((resolve, reject) => {
        error.message = `Failed at downloadVideoYTDL ${error.message}`;
        return reject(error);
      })
    }
  }

  async downloadMultipleVideo(querystring: { urls: string }): Promise<string> {
    try {    
      const urls = querystring.urls.split(',');
      const options = {
      }

      for (const url of urls) {
        const response = await this.downloadVideoYTDL(url, options);
        console.log(url, response);
      }

      return new Promise((resolve, reject) => {
        return resolve('success');
      })
    } catch (error) {
      return new Promise((resolve, reject) => {
        error.message = `Failed at downloadMultipleVideo ${error.message}`;
        return reject(error);
      })
    }
  }

  async downloadVideo(querystring: { url: string }): Promise<string> {
    try {
      const { url } = querystring;
      const options = {
      }
      const readyVideosPathInMp4 = await this.downloadVideoYTDL(url, options);

      const readyVideosPathInHLS = [];
      for (const videoPath of readyVideosPathInMp4) {
          const videoHLS = await this.convertToHLS(videoPath);
          readyVideosPathInHLS.push(videoHLS);
          console.log('readyVideosPathInHLS', readyVideosPathInHLS);
      }

      for (const videoPath of readyVideosPathInHLS) {
        console.log('Starting S3 upload')
        const videoS3 = await this.uploadFolderToS3(videoPath, 'guilhermecanoabucket');
        console.log('videoS3', videoS3);
      }

      return (`Success processing videos: ${readyVideosPathInMp4.join(' | ')}`);
    } catch (error) {
      return new Promise((resolve, reject) => {
        error.message = `Failed at downloadVideo ${error.message}`;
        return reject(error);
      })
    }
  }

  async listVideos(): Promise<string[]> {
    try {
      const s3Client = new S3Client({
        region: process.env.AWS_REGION || 'sa-east-1'
      });

      const bucketName = 'guilhermecanoabucket';
      const prefix = 'videos/hls/';

      const command = new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: prefix
      });

      const response = await s3Client.send(command);
      
      const urls: string[] = [];
      
      response.Contents?.forEach(object => {
        if (object.Key?.endsWith('index.m3u8')) {
          const url = `https://${bucketName}.s3.amazonaws.com/${object.Key}`;
          urls.push(url);
        }
      });

      console.log('list videos response', urls);
      return urls;

    } catch (error) {
      console.error('Error listing videos:', error);
      throw new Error('Failed to list videos from S3');
    }
  }  
}
