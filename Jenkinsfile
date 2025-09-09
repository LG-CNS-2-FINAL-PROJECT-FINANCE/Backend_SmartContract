#!/usr/bin/env groovy
def APP_NAME
def APP_VERSION
def DOCKER_IMAGE_NAME
def PROD_IMAGE_NAME

pipeline {
    agent any

    environment {
        USER_EMAIL = 'ssassaium@gmail.com'
        USER_ID = 'kaebalsaebal'
        DEV_REGISTRY = "192.168.56.200:5000" // 개발용 로컬 레지스트리
        PROD_REGISTRY = credentials('PROD_REGISTRY') // 프로덕션용 AWS ECR 레지스트리
        SERVICE_NAME = 'backend-smart-contract'
    }

    tools {
        nodejs 'NodeJS 20.19.2'
    }

    stages {
        // master/main 브랜치일 때 AWS ECR에 로그인
        stage('Login into AWS ECR') {
            when {
                anyOf {
                    expression { env.BRANCH_NAME == 'master' }
                    expression { env.BRANCH_NAME == 'main' }
                }
            }
            steps {
                script {
                    withCredentials([[
                        $class: 'AmazonWebServicesCredentialsBinding',
                        credentialsId: 'aws-credential',
                        accessKeyVariable: 'AWS_ACCESS_KEY_ID',
                        secretKeyVariable: 'AWS_SECRET_ACCESS_KEY'
                    ]]) {
                        sh """
                        aws ecr get-login-password --region ap-northeast-2 \
                        | podman login --username AWS --password-stdin ${PROD_REGISTRY}
                        """
                    }
                }
            }
        }

        stage('Set Version') {
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

                    if (env.BRANCH_NAME == 'dev') {
                        DOCKER_IMAGE_NAME = "${DEV_REGISTRY}/${APP_NAME}:${APP_VERSION}"
                    } else if (env.BRANCH_NAME == 'master' || env.BRANCH_NAME == 'main') {
                        DOCKER_IMAGE_NAME = "${PROD_REGISTRY}/${APP_NAME}:${APP_VERSION}"
                    }
                
                    sh "echo DOCKER_IMAGE_NAME is ${DOCKER_IMAGE_NAME}"
                }
            }
        }
        
        stage('Checkout Branch') {
            steps {
                checkout scm
            }
        }

        stage('Image Build and Push') {
            steps {
                script {
                    echo "Building and pushing image..."

                    sh "podman build --tag ${DOCKER_IMAGE}:${APP_VERSION} --tag ${DOCKER_IMAGE}:latest ."
                    
                    sh "podman push ${DOCKER_IMAGE}:${APP_VERSION}"
                    sh "podman push ${DOCKER_IMAGE}:latest"
                    
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
