#!/usr/bin/env groovy
def APP_NAME
def APP_VERSION
def DOCKER_IMAGE

pipeline {
    agent any

    environment {
        REGISTRY_HOST = "192.168.56.200:5000"
        USER_EMAIL = 'ssassaium@gmail.com'
        USER_ID = 'kaebalsaebal'
        SERVICE_NAME = 'backend-smart-contract'
    }

    tools {
        nodejs 'NodeJS 20.19.2'
    }
    
    stages {

        stage('Checkout Dev Branch') {
            steps {
                // Git에서 dev 브랜치의 코드를 가져옵니다.
                checkout scm
            }
        }

        stage('Set Version') {
            agent any
            steps {
                script {
                    echo '도커 이미지 이름과 태그를 동적으로 설정합니다...'
        
                    APP_NAME = sh(
                        script: "node -p \"require('./package.json').name\"",
                        returnStdout: true
                    ).trim()

                    APP_VERSION = sh(
                        script: "node -p \"require('./package.json').version\"",
                        returnStdout: true
                    ).trim()
        
                    DOCKER_IMAGE = "${REGISTRY_HOST}/${APP_NAME}"
        
                    sh "echo IMAGE_NAME is ${APP_NAME}"
                    sh "echo IMAGE_VERSION is ${APP_VERSION}"
                    sh "echo DOCKER_IMAGE is ${DOCKER_IMAGE}"
                }
            }
        }
        
        stage('Image Build and Push') {
            steps {
                script {
                    echo "Building and pushing image..."

                    sh "podman build -t ${DOCKER_IMAGE}:${APP_VERSION} -t ${DOCKER_IMAGE}:latest ."
                    sh "podman push ${DOCKER_IMAGE} --all-tags"
                    
                    // 빌드 후 로컬 이미지 제거
                    sh "podman rmi -f ${DOCKER_IMAGE}:${APP_VERSION} ${DOCKER_IMAGE}:latest || true"
                }
            }
        }

        stage('Clean Workspace') {
            steps {
                deleteDir() // workspace 전체 정리
            }
        }
    }

    // 빌드 완료 후
    post {
        // 성공이든, 실패든 항상 수행
        always {
            echo "Cleaning up workspace..."
            deleteDir() // workspace 전체 정리
        }
    }
}
